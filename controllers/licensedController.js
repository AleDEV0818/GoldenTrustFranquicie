import { pool } from "../config/dbConfig.js";
import { Parser } from "json2csv";
import nodemailer from "nodemailer";
import Mailgen from "mailgen";
import dotenv from "dotenv";
dotenv.config();

const NOTIFY_EMAIL = (process.env.NOTIFY_EMAIL || "").trim();
const G_EMAIL = (process.env.G_EMAIL || "").trim();
const G_PASSWORD = (process.env.G_PASSWORD || "").trim();

/* Helpers */
const calculateDaysLeft = (expDate) => {
  if (!expDate) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const exp = new Date(expDate);
  exp.setHours(0,0,0,0);
  return Math.floor((exp - today) / (1000 * 60 * 60 * 24)) + 1;
};

const toISODate = (d) => {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString().slice(0,10);
  if (typeof d === "string") return d.slice(0,10);
  return "";
};

/* In-memory state (cambiar a BD en producción si hace falta) */
let lastNotifyDate = null;
let lastExpiringMail = { to: null, at: null };
let autoMailRecipients = {}; // { [location_id]: [emails] }

/* Endpoints utilitarios */
export const lastExpiringMailInfo = (req, res) => {
  res.json(lastExpiringMail);
};

export const autoExpiringMailRecipients = (req, res) => {
  const { location_id } = req.query;
  const to = autoMailRecipients[location_id] || [];
  res.json({ to });
};

export const setAutoExpiringMailRecipients = (req, res) => {
  const { to, location_id } = req.body;
  if (!location_id || !Array.isArray(to) || to.length === 0) {
    return res.status(400).json({ error: "location_id y al menos un destinatario son requeridos" });
  }
  autoMailRecipients[location_id] = to;
  res.json({ success: true, to });
};

export const emailSentToday = async (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  res.json({ sent: lastNotifyDate === today });
};

export const renderLicensedAgents = async (req, res) => {
  try {
    res.render("licensed_agents", { user: req.user });
  } catch (err) {
    res.status(500).send("Error loading page");
  }
};

/* Listado de agentes (usa función intranet.get_agents_by_location) */
export const listAgents = async (req, res) => {
  const { location_id } = req.query;
  if (!location_id) return res.status(400).json({ error: "location_id required" });

  try {
    // Desactiva vencidos
    await pool.query(`
      UPDATE intranet.licensed
      SET active = false
      WHERE exp_date < CURRENT_DATE AND active = true
    `);

    const result = await pool.query(
      "SELECT * FROM intranet.get_agents_by_location($1)",
      [location_id]
    );

    const data = result.rows
      .filter(r => r.name) // Asumiendo que la función devuelve 'name'
      .map(r => {
        const days_left = calculateDaysLeft(r.exp_date);
        const status = days_left < 0 ? false : !!r.status;
        return {
          ...r,
            days_left,
            status,
            licensed_agent_id: r.licensed_agent_id || r.licensed_id || r.id
        };
      });

    res.json(data);
  } catch (err) {
    console.error("listAgents error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* Exportar CSV */
export const exportCsv = async (req, res) => {
  const { location_id } = req.query;
  if (!location_id) return res.status(400).json({ error: "location_id required" });

  try {
    await pool.query(`
      UPDATE intranet.licensed
      SET active = false
      WHERE exp_date < CURRENT_DATE AND active = true
    `);

    const result = await pool.query(
      "SELECT * FROM intranet.get_agents_by_location($1)",
      [location_id]
    );

    const data = result.rows
      .filter(r => r.name)
      .map(r => {
        const days_left = calculateDaysLeft(r.exp_date);
        const status = days_left < 0 ? "Inactive" : (r.status ? "Active" : "Inactive");
        return {
          NAME: r.name,
          EMAIL: r.email,
          JOB_TITLE: r.job_title,
          LICENSEE_NUMBER: r.license_number,
          ISSUE_DATE: toISODate(r.issue_date),
          EXP_DATE: toISODate(r.exp_date),
          STATUS: status,
          DAYS_LEFT: days_left < 0 ? "Expired" : days_left
        };
      });

    if (data.length === 0) {
      return res.status(200)
        .attachment("licensed_agents.csv")
        .send("No data");
    }

    const fields = Object.keys(data[0]);
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.header("Content-Type", "text/csv");
    res.attachment("licensed_agents.csv");
    res.send(csv);
  } catch (err) {
    console.error("exportCsv error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* Alta de licencia */
export const addAgent = async (req, res) => {
  const {
    user_id,
    license_number,
    issue_date,
    exp_date,
    active,
    location_id
  } = req.body;

  if (!user_id || !license_number || !issue_date || !exp_date) {
    return res.status(400).json({ error: "user_id, license_number, issue_date y exp_date son requeridos" });
  }

  try {
    const userRes = await pool.query(
      "SELECT display_name, mail, job_title FROM entra.users WHERE user_id=$1",
      [user_id]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const { display_name, mail, job_title } = userRes.rows[0];

    await pool.query(`
      INSERT INTO intranet.licensed
      (user_id, display_name, mail, job_title, license_number, issue_date, exp_date, active, location_id, updated_by_display_name, updated_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      user_id, display_name, mail, job_title,
      license_number, issue_date, exp_date,
      active ?? true, location_id,
      req.user?.display_name || null,
      req.user?.user_id || null
    ]);

    res.json({ success: true, message: "Licensed agent added" });
  } catch (err) {
    console.error("addAgent error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* Usuarios disponibles (no licenciados aún) */
export const getAvailableUsers = async (req, res) => {
  const { location_id } = req.query;
  if (!location_id) return res.status(400).json({ error: "location_id required" });

  try {
    const locRes = await pool.query(
      "SELECT location_type FROM qq.locations WHERE location_id=$1",
      [location_id]
    );
    if (locRes.rowCount === 0) return res.status(404).json({ error: "Location not found" });

    const { location_type } = locRes.rows[0];
    let usersRes;

    if (location_type == 1) {
      usersRes = await pool.query(`
        SELECT u.user_id, u.display_name, u.mail, u.job_title
        FROM entra.users u
        JOIN qq.locations l ON u.location_id = l.location_id
        WHERE l.location_type = 1
          AND u.active = true
      `);
    } else if (location_type == 2 || location_type == 4) {
      usersRes = await pool.query(`
        SELECT user_id, display_name, mail, job_title
        FROM entra.users
        WHERE location_id = $1
          AND active = true
      `, [location_id]);
    } else {
      usersRes = { rows: [] };
    }

    res.json(usersRes.rows);
  } catch (err) {
    console.error("getAvailableUsers error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* Usuarios para envío de correo (tabla intranet.mail) */
export const getMailUsersByLocation = async (req, res) => {
  const { location_id } = req.query;
  if (!location_id) return res.status(400).json({ error: "location_id required" });

  try {
    const locRes = await pool.query(
      "SELECT location_type FROM qq.locations WHERE location_id=$1",
      [location_id]
    );
    if (locRes.rowCount === 0) return res.status(404).json({ error: "Location not found" });

    const { location_type } = locRes.rows[0];
    let usersRes;

    if (location_type == 1) {
      usersRes = await pool.query(`
        SELECT user_id, display_name, mail
        FROM intranet.mail
        WHERE location_id IN (
          SELECT location_id FROM qq.locations WHERE location_type = 1
        )
      `);
    } else if (location_type == 2 || location_type == 4) {
      usersRes = await pool.query(`
        SELECT user_id, display_name, mail
        FROM intranet.mail
        WHERE location_id = $1
      `, [location_id]);
    } else {
      usersRes = { rows: [] };
    }

    res.json(usersRes.rows);
  } catch (err) {
    console.error("getMailUsersByLocation error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* Editar licencia */
export const editAgent = async (req, res) => {
  const agentId = req.params.id;
  const { license_number, active, issue_date, exp_date } = req.body;

  if (!agentId) return res.status(400).json({ error: "licensed_agent_id requerido" });

  try {
    const result = await pool.query(`
      UPDATE intranet.licensed
      SET license_number = $1,
          active = $2,
          issue_date = $3,
          exp_date = $4,
          updated_at = now(),
          updated_by_display_name = $5,
          updated_by_user_id = $6
      WHERE licensed_agent_id = $7
    `, [
      license_number,
      active,
      issue_date,
      exp_date,
      req.user?.display_name || null,
      req.user?.user_id || null,
      agentId
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({ success: true, message: "Agent updated" });
  } catch (err) {
    console.error("editAgent error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* Eliminar licencia */
export const deleteAgent = async (req, res) => {
  const agentId = req.params.id;
  if (!agentId) return res.status(400).json({ error: "Agent ID is required" });

  try {
    const result = await pool.query(
      "DELETE FROM intranet.licensed WHERE licensed_agent_id = $1",
      [agentId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Agent not found or already deleted" });
    }
    res.json({ success: true, message: "Agent deleted" });
  } catch (err) {
    console.error("deleteAgent error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* Envío automático diario (una vez por día por server) */
export const notifyExpiringAgents = async (req, res) => {
  try {
    const { location_id } = req.body;
    if (!location_id) return res.status(400).json({ error: "location_id required" });

    const today = new Date().toISOString().slice(0,10);
    if (lastNotifyDate === today) {
      return res.json({ alreadySent: true, msg: "Email already sent today." });
    }

    const recipients = autoMailRecipients[location_id];
    if (!recipients || recipients.length === 0) {
      return res.status(400).json({ error: "No auto mail recipients configured for this location." });
    }

    const result = await pool.query(`
      SELECT display_name, mail, job_title, exp_date
      FROM intranet.licensed
      WHERE active = true
        AND exp_date > CURRENT_DATE
        AND exp_date <= CURRENT_DATE + INTERVAL '30 days'
        AND location_id = $1
    `, [location_id]);

    if (result.rowCount === 0) {
      return res.json({ msg: "No agents expiring soon." });
    }

    const tableRows = result.rows.map(a => {
      const daysLeft = calculateDaysLeft(a.exp_date);
      return `
        <tr>
          <td>${a.display_name}</td>
          <td>${a.mail}</td>
          <td>${a.job_title || ""}</td>
          <td>${toISODate(a.exp_date)}</td>
          <td>${daysLeft}</td>
        </tr>
      `;
    }).join("");

    const tableHTML = `
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin:18px 0;">
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Job Title</th><th>Exp. Date</th><th>Days Left</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: G_EMAIL, pass: G_PASSWORD }
    });

    const mailGenerator = new Mailgen({
      theme: "default",
      product: {
        name: "GoldenTrust Insurance's Intranet",
        link: "https://goldentrustinsurance.com/"
      }
    });

    let body = {
      body: {
        name: "Supervisor",
        intro: "These agents have licenses expiring soon (30 days or less):",
        table: { data: [], columns: [] },
        outro: "Please take the necessary actions."
      }
    };

    let html = mailGenerator.generate(body).replace(/(<\/p>)/, `$1${tableHTML}`);

    await transporter.sendMail({
      from: `GTI <${G_EMAIL}>`,
      to: recipients.join(","),
      subject: "Agents with licenses expiring soon",
      html
    });

    lastNotifyDate = today;
    lastExpiringMail = { to: recipients, at: new Date().toISOString() };

    res.json({ msg: "Mail sent to recipients with expiring agents.", to: recipients });
  } catch (error) {
    console.error("notifyExpiringAgents error:", error);
    res.status(500).json({ error: error.message });
  }
};

/* Envío manual */
export const sendExpiringAgentsMail = async (req, res) => {
  let { to, location_id } = req.body;
  let toArray = [];

  if (Array.isArray(to)) {
    toArray = [...new Set(to.filter(m => typeof m === "string" && m.includes("@")))];
  } else if (typeof to === "string" && to.includes("@")) {
    toArray = [to];
  }

  if (!location_id || toArray.length === 0) {
    return res.status(400).json({ error: "Recipient(s) and location_id required" });
  }

  try {
    const result = await pool.query(`
      SELECT display_name, mail, job_title, exp_date
      FROM intranet.licensed
      WHERE active = true
        AND exp_date > CURRENT_DATE
        AND exp_date <= CURRENT_DATE + INTERVAL '30 days'
        AND location_id = $1
    `, [location_id]);

    if (result.rowCount === 0) {
      return res.json({ success: false, msg: "No agents expiring soon." });
    }

    const tableRows = result.rows.map(a => {
      const daysLeft = calculateDaysLeft(a.exp_date);
      return `
        <tr>
          <td>${a.display_name}</td>
          <td>${a.mail}</td>
          <td>${a.job_title || ""}</td>
          <td>${toISODate(a.exp_date)}</td>
          <td>${daysLeft}</td>
        </tr>
      `;
    }).join("");

    const tableHTML = `
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin:18px 0;">
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Job Title</th><th>Exp. Date</th><th>Days Left</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: G_EMAIL, pass: G_PASSWORD }
    });

    const mailGenerator = new Mailgen({
      theme: "default",
      product: {
        name: "GoldenTrust Insurance's Intranet",
        link: "https://goldentrustinsurance.com/"
      }
    });

    let body = {
      body: {
        name: toArray.join(", "),
        intro: "These agents have licenses expiring soon (30 days or less):",
        table: { data: [], columns: [] },
        outro: "Please take the necessary actions."
      }
    };

    let html = mailGenerator.generate(body).replace(/(<\/p>)/, `$1${tableHTML}`);

    await transporter.sendMail({
      from: `GTI <${G_EMAIL}>`,
      to: toArray.join(","),
      subject: "Agents with licenses expiring soon",
      html
    });

    lastExpiringMail = { to: toArray, at: new Date().toISOString() };

    res.json({ success: true, msg: "Email sent", to: toArray, at: lastExpiringMail.at });
  } catch (error) {
    console.error("sendExpiringAgentsMail error:", error);
    res.status(500).json({ error: error.message });
  }
};