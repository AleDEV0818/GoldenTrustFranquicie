import { pool } from "../config/dbConfig.js";
import axios from "axios";

const EMAIL_LIST_VERIFY_KEY = process.env.EMAIL_LIST_VERIFY_KEY;

// Verifica un email usando EmailListVerify API
async function verifyEmail(apiKey, email) {
  if (!email || !email.includes("@")) return "invalid";
  const url = `https://api.emaillistverify.com/api/verifyEmail?secret=${apiKey}&email=${encodeURIComponent(email)}`;
  try {
    const response = await axios.get(url);
    const raw = response.data;

    let status = "";
    if (typeof raw === "string") {
      status = raw.trim().toLowerCase();
    } else if (raw && typeof raw === "object") {
      status = String(raw.status ?? raw.result ?? raw.verdict ?? "").trim().toLowerCase();
    }
    if (status === "ok_for_all" || status === "ok for all") status = "ok";
    return status || "unknown";
  } catch (error) {
    console.error(`Error verificando email [${email}]:`, error?.response?.data || error?.message || error);
    return "error";
  }
}

async function upsertContactEmailStatus(contactId, email, status) {
  await pool.query(
    `
    INSERT INTO intranet.contact_email_checks (contact_id, email, email_status, email_checked_on)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (contact_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      email_status = EXCLUDED.email_status,
      email_checked_on = NOW()
    `,
    [contactId, email, status]
  );
}

async function verifyAndUpdateContactEmail(entityId, email) {
  const status = await verifyEmail(EMAIL_LIST_VERIFY_KEY, email);
  console.log(`[EMAIL VERIFY] ${email}: ${status}`);
  await upsertContactEmailStatus(entityId, email, status);
  return status;
}

function getEffectiveLocationId(req) {
  if (req.scope?.locationId) return Number(req.scope.locationId);
  if (req.user?.location_id) return Number(req.user.location_id);
  if (req.query?.location) {
    const n = Number(req.query.location);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

async function getLocationType(locationId) {
  const result = await pool.query(
    `SELECT location_type FROM qq.locations WHERE location_id = $1 LIMIT 1`,
    [locationId]
  );
  return result.rows.length ? Number(result.rows[0].location_type) : null;
}

// POST /api/missing-contact-errors/verify
export const verifyContactsEmails = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: "location_id is required (use scopeLocation or pass ?location=ID)" });
    }

    const locationType = await getLocationType(locationId);

    let contactsToValidate = [];
    if (locationType === 1) {
      const contactsRes = await pool.query(`
        SELECT c.entity_id, c.email
        FROM qq.contacts c
        JOIN qq.locations l ON c.location_id = l.location_id
        LEFT JOIN intranet.contact_email_checks ce ON ce.contact_id = c.entity_id
        WHERE l.location_type = 2
          AND c.email IS NOT NULL
          AND btrim(c.email) <> ''
          AND (
            ce.email_status IS NULL
            OR btrim(ce.email_status) = ''
            OR lower(ce.email_status) = 'error'
          )
      `);
      contactsToValidate = contactsRes.rows;
    } else if (locationType === 2) {
      const contactsRes = await pool.query(
        `
        SELECT c.entity_id, c.email
        FROM qq.contacts c
        LEFT JOIN intranet.contact_email_checks ce ON ce.contact_id = c.entity_id
        WHERE c.location_id = $1
          AND c.email IS NOT NULL
          AND btrim(c.email) <> ''
          AND (
            ce.email_status IS NULL
            OR btrim(ce.email_status) = ''
            OR lower(ce.email_status) = 'error'
          )
        `,
        [locationId]
      );
      contactsToValidate = contactsRes.rows;
    } else {
      return res.status(400).json({ error: "Invalid location type or location not found." });
    }

    let verified = 0;
    for (const contact of contactsToValidate) {
      await verifyAndUpdateContactEmail(contact.entity_id, contact.email);
      verified++;
    }

    res.set("Cache-Control", "no-store, max-age=0");
    return res.json({
      ok: true,
      verified,
      message:
        verified > 0
          ? `Verification completed for ${verified} contact(s).`
          : "No contacts pending verification (NULL/empty/error) for this location."
    });
  } catch (error) {
    console.error("Error in verifyContactsEmails:", error);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// GET /api/missing-contact-errors?type=email|phone|invalid_email&location=ID
export const fetchMissingContactErrors = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: "location_id is required (use scopeLocation or pass ?location=ID)" });
    }

    const typeRaw = (req.query.type || "").trim().toLowerCase();
    const type = typeRaw === "phone" ? "phone" : typeRaw === "invalid_email" ? "invalid_email" : "email";

    let franchises = [];
    if (req.user?.location_type === 1) {
      const franchiseRows = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = franchiseRows.rows;
    }

    let locationAlias = "—";
    if (locationId) {
      const aliasRows = await pool.query(
        `SELECT alias FROM qq.locations WHERE location_id = $1 LIMIT 1`,
        [locationId]
      );
      if (aliasRows.rows.length) {
        locationAlias = aliasRows.rows[0].alias || "—";
      }
    }

    if (type === "invalid_email") {
      const result = await pool.query(
        `SELECT * FROM intranet.get_active_customers_with_invalid_email($1::int)`,
        [locationId]
      );
      const rows = result.rows;
      let verificationMessage = "";
      if (!rows || rows.length === 0) {
        verificationMessage = "All emails have been successfully verified or there are no invalid emails.";
      }

      res.set("Cache-Control", "no-store, max-age=0");
      return res.json({
        rows,
        type,
        locationId,
        franchises,
        locationAlias,
        verificationMessage
      });
    }

    const fn = type === "phone"
      ? "intranet.get_active_customers_without_phone"
      : "intranet.get_active_customers_without_email";

    const sql = `SELECT * FROM ${fn}($1::int)`;
    const { rows } = await pool.query(sql, [locationId]);

    if (type === "email") {
      for (const row of rows) {
        if (row.email && row.email.trim() !== "") {
          const checkStatus = await pool.query(
            `SELECT email_status FROM intranet.contact_email_checks WHERE contact_id = $1`,
            [row.customer_id]
          );
          const status = checkStatus.rows[0]?.email_status;
          if (!status || status !== "ok") {
            const verifiedStatus = await verifyAndUpdateContactEmail(row.customer_id, row.email);
            row.email_status = verifiedStatus;
          } else {
            row.email_status = status;
          }
        } else {
          row.email_status = null;
        }
      }
      const filteredRows = rows.filter(r => r.email_status !== "ok");
      res.set("Cache-Control", "no-store, max-age=0");
      return res.json({
        rows: filteredRows,
        type,
        locationId,
        franchises,
        locationAlias
      });
    } else {
      res.set("Cache-Control", "no-store, max-age=0");
      return res.json({
        rows,
        type,
        locationId,
        franchises,
        locationAlias
      });
    }
  } catch (error) {
    console.error("Error in fetchMissingContactErrors:", error);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// SSR de la vista
export const renderMissingContactErrorsView = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) return res.status(400).send("location_id is required.");

    const typeRaw = (req.query.type || "").trim().toLowerCase();
    const type = typeRaw === "phone" ? "phone" : typeRaw === "invalid_email" ? "invalid_email" : "email";

    let franchises = [];
    if (req.user?.location_type === 1) {
      const franchiseRows = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = franchiseRows.rows;
    }

    let locationAlias = "—";
    if (locationId) {
      const aliasRows = await pool.query(
        `SELECT alias FROM qq.locations WHERE location_id = $1 LIMIT 1`,
        [locationId]
      );
      if (aliasRows.rows.length) {
        locationAlias = aliasRows.rows[0].alias || "—";
      }
    }

    // KPIs SSR
    const acRes = await pool.query(
      `SELECT intranet.count_clients_with_active_policies($1) AS active_clients_count`,
      [locationId]
    );
    const activeClientsCount = Number(acRes.rows?.[0]?.active_clients_count ?? 0);

    const sums = await pool.query(
      `
      SELECT
        (SELECT COUNT(*) FROM intranet.get_active_customers_without_email($1))      AS email_missing_count,
        (SELECT COUNT(*) FROM intranet.get_active_customers_without_phone($1))      AS phone_missing_count,
        (SELECT COUNT(*) FROM intranet.get_active_customers_with_invalid_email($1)) AS invalid_email_count
      `,
      [locationId]
    );
    const emailMissing = Number(sums.rows?.[0]?.email_missing_count ?? 0);
    const phoneMissing = Number(sums.rows?.[0]?.phone_missing_count ?? 0);
    const invalidEmail = Number(sums.rows?.[0]?.invalid_email_count ?? 0);
    const totalContactErrors = emailMissing + phoneMissing + invalidEmail;

    let rows = [];
    let verificationMessage = "";
    if (type === "invalid_email") {
      const result = await pool.query(
        `SELECT * FROM intranet.get_active_customers_with_invalid_email($1::int)`,
        [locationId]
      );
      rows = result.rows;
      if (!rows || rows.length === 0) {
        verificationMessage = "All emails have been successfully verified or there are no invalid emails.";
      }
    } else {
      const fn = type === "phone"
        ? "intranet.get_active_customers_without_phone"
        : "intranet.get_active_customers_without_email";

      const sql = `SELECT * FROM ${fn}($1::int)`;
      const result = await pool.query(sql, [locationId]);
      rows = result.rows;
    }

    res.render("missing-contact-errors", {
      user: req.user,
      initialRows: rows || [],
      locationId,
      type,
      franchises,
      locationAlias,
      verificationMessage,
      // KPIs SSR
      activeClientsCount,
      totalContactErrors,
      emailMissing,
      phoneMissing,
      invalidEmail
    });
  } catch (e) {
    console.error("renderMissingContactErrorsView error:", e);
    res.status(500).render("error", { message: "Server error", error: e, details: process.env.NODE_ENV === "development" ? e.message : "Contact support" });
  }
};

// NUEVOS ENDPOINTS KPI
// GET /api/active-clients-count?location=ID
export const fetchActiveClientsCount = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: "location_id is required (use scopeLocation or pass ?location=ID)" });
    }
    const { rows } = await pool.query(
      `SELECT intranet.count_clients_with_active_policies($1) AS count`,
      [locationId]
    );
    const count = Number(rows?.[0]?.count ?? 0);
    res.set("Cache-Control", "no-store, max-age=0");
    return res.json({ locationId, count });
  } catch (e) {
    console.error("fetchActiveClientsCount error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};

// GET /api/missing-contact-errors/summary?location=ID
export const fetchMissingContactSummary = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: "location_id is required (use scopeLocation or pass ?location=ID)" });
    }

    const sums = await pool.query(
      `
      SELECT
        (SELECT COUNT(*) FROM intranet.get_active_customers_without_email($1))      AS email_missing_count,
        (SELECT COUNT(*) FROM intranet.get_active_customers_without_phone($1))      AS phone_missing_count,
        (SELECT COUNT(*) FROM intranet.get_active_customers_with_invalid_email($1)) AS invalid_email_count
      `,
      [locationId]
    );
    const email_missing = Number(sums.rows?.[0]?.email_missing_count ?? 0);
    const phone_missing = Number(sums.rows?.[0]?.phone_missing_count ?? 0);
    const invalid_email = Number(sums.rows?.[0]?.invalid_email_count ?? 0);
    const total = email_missing + phone_missing + invalid_email;

    res.set("Cache-Control", "no-store, max-age=0");
    return res.json({
      locationId,
      totals: {
        total,
        email_missing,
        phone_missing,
        invalid_email
      }
    });
  } catch (e) {
    console.error("fetchMissingContactSummary error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};

export default {
  fetchMissingContactErrors,
  verifyContactsEmails,
  renderMissingContactErrorsView,
  fetchActiveClientsCount,
  fetchMissingContactSummary
};