import { pool } from "../config/dbConfig.js";
import { Parser } from "json2csv";
import nodemailer from "nodemailer";
import Mailgen from "mailgen";
import dotenv from "dotenv";
dotenv.config();

const NOTIFY_EMAIL = (process.env.NOTIFY_EMAIL || "").trim();
const G_EMAIL = (process.env.G_EMAIL || "").trim();
const G_PASSWORD = (process.env.G_PASSWORD || "").trim();

const calculateDaysLeft = (expDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expDate);
  exp.setHours(0, 0, 0, 0);
  return Math.floor((exp - today) / (1000 * 60 * 60 * 24)) + 1;
};

// Simple in-memory cache for daily notification (restart loses data, use DB for production!)
let lastNotifyDate = null;

// Store last expiring mail sent info (to, at)
let lastExpiringMail = {
  to: null, // array or string
  at: null // ISO string
};

// NEW: Store auto mail recipients per location (use DB for production)
let autoMailRecipients = {}; // { [location_id]: [array of emails] }

// Endpoint: Info about last expiring mail sent (recipient & time)
export const lastExpiringMailInfo = (req, res) => {
  res.json(lastExpiringMail);
};

// Endpoint: Get current auto mail recipients for a location
export const autoExpiringMailRecipients = (req, res) => {
  const { location_id } = req.query;
  const to = autoMailRecipients[location_id] || [];
  res.json({ to });
};

// Endpoint: Save auto mail recipients for a location
export const setAutoExpiringMailRecipients = (req, res) => {
  const { to, location_id } = req.body;
  if (!location_id || !Array.isArray(to) || to.length === 0) {
    return res.status(400).json({ error: "location_id and at least one recipient are required." });
  }
  autoMailRecipients[location_id] = to;
  res.json({ success: true, to });
};

// Endpoint to check if notification email was sent today
export const emailSentToday = async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json({ sent: lastNotifyDate === today });
};

// Do NOT send notification email when rendering agents page
export const renderLicensedAgents = async (req, res) => {
  try {
    res.render('licensed_agents', {
      user: req.user
    });
  } catch (err) {
    res.status(500).send('Error loading page');
  }
};

export const listAgents = async (req, res) => {
  const { location_id } = req.query;
  if (!location_id) return res.status(400).json({ error: 'location_id required' });

  try {
    await pool.query(
      `UPDATE entra.licensed SET active = false
       WHERE exp_date < CURRENT_DATE AND active = true`
    );

    const result = await pool.query('SELECT * FROM intranet.get_agents_by_location($1)', [location_id]);
    const data = result.rows
      .filter(row => row.name)
      .map(row => {
        const days_left = calculateDaysLeft(row.exp_date);
        const status = days_left < 0 ? false : !!row.status;
        return {
          ...row,
          days_left,
          status,
          licensed_agent_id: row.licensed_agent_id || row.licensed_id || row.id
        };
      });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const exportCsv = async (req, res) => {
  const { location_id } = req.query;
  if (!location_id) return res.status(400).json({ error: 'location_id required' });

  try {
    await pool.query(
      `UPDATE entra.licensed SET active = false
       WHERE exp_date < CURRENT_DATE AND active = true`
    );

    const result = await pool.query('SELECT * FROM intranet.get_agents_by_location($1)', [location_id]);
    const data = result.rows
      .filter(row => row.name)
      .map(row => {
        const days_left = calculateDaysLeft(row.exp_date);
        const status = days_left < 0 ? 'Inactive' : (row.status ? 'Active' : 'Inactive');
        // Helper to format date as YYYY-MM-DD
        const formatDate = (d) => {
          if (!d) return '';
          if (d instanceof Date) return d.toISOString().slice(0, 10);
          if (typeof d === 'string') return d.slice(0, 10);
          return '';
        };
        return {
          NAME: row.name,
          EMAIL: row.email,
          JOB_TITLE: row.job_title,
          LICENSEE_NUMBER: row.license_number,
          ISSUE_DATE: formatDate(row.issue_date),
          EXP_DATE: formatDate(row.exp_date),
          STATUS: status,
          DAYS_LEFT: days_left < 0 ? 'Expired' : days_left
        };
      });
    const fields = Object.keys(data[0] || {});
    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(data);

    res.header('Content-Type', 'text/csv');
    res.attachment('licensed_agents.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const addAgent = async (req, res) => {
  const {
    user_id,
    license_number,
    issue_date,
    exp_date,
    active,
    location_id,
  } = req.body;

  try {
    const userRes = await pool.query(
      'SELECT display_name, mail, job_title FROM entra.users WHERE user_id=$1',
      [user_id]
    );
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });

    const { display_name, mail, job_title } = userRes.rows[0];

    await pool.query(
      `INSERT INTO entra.licensed
      (user_id, display_name, mail, job_title, license_number, issue_date, exp_date, active, location_id, updated_by_display_name, updated_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        user_id, display_name, mail, job_title,
        license_number, issue_date, exp_date, active ?? true, location_id,
        req.user.display_name, req.user.user_id
      ]
    );

    res.json({ success: true, message: 'Licensed agent added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getAvailableUsers = async (req, res) => {
  const { location_id } = req.query;
  if (!location_id) return res.status(400).json({ error: 'location_id required' });

  try {
    const locRes = await pool.query('SELECT location_type FROM qq.locations WHERE location_id=$1', [location_id]);
    if (locRes.rowCount === 0) return res.status(404).json({ error: 'Location not found' });

    const { location_type } = locRes.rows[0];

    let usersRes;
    if (location_type == 1) {
      usersRes = await pool.query(
        `SELECT u.user_id, u.display_name, u.mail, u.job_title FROM entra.users u
         JOIN qq.locations l ON u.location_id = l.location_id
         WHERE l.location_type = 1 and u.active=true`
      );
    } else if (location_type == 2 || location_type == 4) {
      usersRes = await pool.query(
        `SELECT user_id, display_name, mail, job_title FROM entra.users
         WHERE location_id = $1 and active=true`,
        [location_id]
      );
    } else {
      usersRes = { rows: [] };
    }

    res.json(usersRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMailUsersByLocation = async (req, res) => {
  const { location_id } = req.query;
  if (!location_id) return res.status(400).json({ error: 'location_id required' });

  try {
    const locRes = await pool.query('SELECT location_type FROM qq.locations WHERE location_id=$1', [location_id]);
    if (locRes.rowCount === 0) return res.status(404).json({ error: 'Location not found' });

    const { location_type } = locRes.rows[0];

    let usersRes;
    if (location_type == 1) {
      usersRes = await pool.query(
        `SELECT user_id, display_name, mail FROM admin.mail WHERE location_id IN 
         (SELECT location_id FROM qq.locations WHERE location_type = 1)`
      );
    } else if (location_type == 2 || location_type == 4) {
      usersRes = await pool.query(
        `SELECT user_id, display_name, mail FROM admin.mail WHERE location_id = $1`,
        [location_id]
      );
    } else {
      usersRes = { rows: [] };
    }

    res.json(usersRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const editAgent = async (req, res) => {
  const agentId = req.params.id;
  const { license_number, active, issue_date, exp_date } = req.body;

  try {
    await pool.query(
      `UPDATE entra.licensed
       SET license_number = $1,
           active = $2,
           issue_date = $3,
           exp_date = $4,
           updated_at = now(),
           updated_by_display_name = $5,
           updated_by_user_id = $6
       WHERE licensed_agent_id = $7`,
      [
        license_number, active, issue_date, exp_date,
        req.user.display_name, req.user.user_id,
        agentId
      ]
    );
    res.json({ success: true, message: 'Agent updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteAgent = async (req, res) => {
  const agentId = req.params.id;
  if (!agentId) return res.status(400).json({ error: 'Agent ID is required' });

  try {
    await pool.query(
      `DELETE FROM entra.licensed WHERE licensed_agent_id = $1`,
      [agentId]
    );
    res.json({ success: true, message: 'Agent deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Only send notification email ONCE per day (per server restart)
// MODIFICADO: Enviar a todos los autoMailRecipients de la location_id
export const notifyExpiringAgents = async (req, res) => {
  try {
    const { location_id } = req.body;
    if (!location_id) return res.status(400).json({ error: 'location_id required' });

    const today = new Date().toISOString().slice(0, 10);
    if (lastNotifyDate === today) {
      if (res) return res.json({ alreadySent: true, msg: "Email already sent today." });
      return;
    }

    const recipients = autoMailRecipients[location_id];
    if (!recipients || !recipients.length) {
      throw new Error("No auto mail recipients configured for this location.");
    }

    // Get agents expiring soon for location
    const result = await pool.query(`
      SELECT display_name, mail, job_title, exp_date
      FROM entra.licensed
      WHERE active = true
        AND exp_date > CURRENT_DATE
        AND exp_date <= CURRENT_DATE + INTERVAL '30 days'
        AND location_id = $1
    `, [location_id]);

    if (result.rows.length === 0) {
      if (res) return res.json({ msg: "No agents expiring soon." });
      return;
    }

    const tableRows = result.rows.map(agent => {
      const daysLeft = Math.ceil((new Date(agent.exp_date) - new Date()) / (1000 * 60 * 60 * 24));
      return `
        <tr>
          <td>${agent.display_name}</td>
          <td>${agent.mail}</td>
          <td>${agent.job_title}</td>
          <td>${agent.exp_date.toISOString().slice(0,10)}</td>
          <td>${daysLeft}</td>
        </tr>
      `;
    }).join('');

    const tableHTML = `
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin:18px 0;">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Job Title</th>
            <th>Exp. Date</th>
            <th>Days Left</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    let config = {
      service: 'gmail',
      auth: { user: G_EMAIL, pass: G_PASSWORD }
    };

    let transporter = nodemailer.createTransport(config);
    let mailGenerator = new Mailgen({
      theme: 'default',
      product: {
        name: `GoldenTrust Insurance's Intranet`,
        link: 'https://goldentrustinsurance.com/'
      }
    });

    let response = {
      body: {
        name: "Supervisor",
        intro: `These agents have licenses expiring soon (30 days or less):`,
        table: { data: [], columns: [] },
        outro: "Please take the necessary actions."
      }
    };

    let mail = mailGenerator.generate(response);
    mail = mail.replace(/(<\/p>)/, `$1${tableHTML}`);

    let message = {
      from: `GTI <${G_EMAIL}>`,
      to: recipients.join(","),
      subject: `Agents with licenses expiring soon`,
      html: mail
    };

    await transporter.sendMail(message);

    lastNotifyDate = today;
    lastExpiringMail = {
      to: recipients,
      at: new Date().toISOString()
    };

    if (res) return res.json({ msg: "Mail sent to recipients with expiring agents.", to: recipients });
  } catch (error) {
    console.error("Error notifying about expiring licenses:", error);
    if (res) res.status(500).json({ error: error.message });
  }
};

// NUEVO: Enviar tabla de agentes por vencer a uno o varios destinatarios seleccionados
export const sendExpiringAgentsMail = async (req, res) => {
  let { to, location_id } = req.body;
  // aceptar string (un destinatario) o array (varios)
  let toArray = [];
  if (Array.isArray(to)) {
    toArray = to.filter(m => typeof m === "string" && m.includes("@"));
  } else if (typeof to === "string" && to.includes("@")) {
    toArray = [to];
  }
  if (!location_id || !toArray.length) {
    return res.status(400).json({ error: 'Recipient(s) and location_id required' });
  }

  try {
    const result = await pool.query(`
      SELECT display_name, mail, job_title, exp_date
      FROM entra.licensed
      WHERE active = true
        AND exp_date > CURRENT_DATE
        AND exp_date <= CURRENT_DATE + INTERVAL '30 days'
        AND location_id = $1
    `, [location_id]);

    if (result.rows.length === 0) {
      return res.json({ success: false, msg: "No agents expiring soon." });
    }

    const tableRows = result.rows.map(agent => {
      const daysLeft = Math.ceil((new Date(agent.exp_date) - new Date()) / (1000 * 60 * 60 * 24));
      return `
        <tr>
          <td>${agent.display_name}</td>
          <td>${agent.mail}</td>
          <td>${agent.job_title}</td>
          <td>${agent.exp_date.toISOString().slice(0,10)}</td>
          <td>${daysLeft}</td>
        </tr>
      `;
    }).join('');

    const tableHTML = `
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin:18px 0;">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Job Title</th>
            <th>Exp. Date</th>
            <th>Days Left</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    let config = {
      service: 'gmail',
      auth: { user: G_EMAIL, pass: G_PASSWORD }
    };

    let transporter = nodemailer.createTransport(config);
    let mailGenerator = new Mailgen({
      theme: 'default',
      product: {
        name: `GoldenTrust Insurance's Intranet`,
        link: 'https://goldentrustinsurance.com/'
      }
    });

    let response = {
      body: {
        name: toArray.join(", "),
        intro: `These agents have licenses expiring soon (30 days or less):`,
        table: { data: [], columns: [] },
        outro: "Please take the necessary actions."
      }
    };

    let mail = mailGenerator.generate(response);
    mail = mail.replace(/(<\/p>)/, `$1${tableHTML}`);

    let message = {
      from: `GTI <${G_EMAIL}>`,
      to: toArray.join(","),
      subject: `Agents with licenses expiring soon`,
      html: mail
    };

    await transporter.sendMail(message);

    // Guardar último destinatario y hora de envío
    lastExpiringMail = {
      to: toArray,
      at: new Date().toISOString()
    };

    return res.json({ success: true, msg: 'Email sent', to: toArray, at: lastExpiringMail.at });
  } catch (error) {
    console.error("Error sending expiring agents email:", error);
    res.status(500).json({ error: error.message });
  }
};