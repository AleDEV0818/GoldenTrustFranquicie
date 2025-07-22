import { pool } from "../config/dbConfig.js";

// Obtener la meta mensual desde la base de datos (último valor)
const getMonthlyGoal = async () => {
  try {
    const result = await pool.query(
      `SELECT goal_amount FROM entra.goals ORDER BY changed_at DESC LIMIT 1`
    );
    return result.rows.length > 0 ? Number(result.rows[0].goal_amount) : 10000000;
  } catch (error) {
    console.error("Error fetching monthly goal from DB:", error);
    return 10000000;
  }
};

// Actualizar goal (desde el formulario en la web) y guardar el cambio en la tabla
const setMonthlyGoal = async (req, res) => {
  const newGoal = Number(req.body.monthly_goal) || 10000000;
  try {
    // Guarda el nuevo goal en la tabla con la fecha/hora actual
    await pool.query(
      `INSERT INTO entra.goals (goal_amount) VALUES ($1)`,
      [newGoal]
    );
  } catch (error) {
    console.error("Error inserting new goal in DB:", error);
    // Puedes mostrar un mensaje de error si lo necesitas
  }
  res.redirect('/users/config/headcarriers');
};

// Renderizar la página de configuración, pasando el goal como número, string formateado, fecha y contador
const headcarrier = async (req, res) => {
  let data = {};
  data.user = req.user;
  try {
    const result = await pool.query(
      `SELECT entity_id, display_name FROM qq.contacts WHERE (type_display = 'R' or type_display = 'M') and status = 'A' ORDER BY display_name`
    );
    data.carriers = result.rows;
  } catch (error) {
    console.log(`Function headcarrier `, error);
    data.carriers = [];
  }

  // Obtener el último goal y su fecha y cuántas veces se cambió
  let goal = 10000000;
  let lastChanged = null;
  let changesCount = 0;
  try {
    const lastGoal = await pool.query('SELECT goal_amount, changed_at FROM entra.goals ORDER BY changed_at DESC LIMIT 1');
    if (lastGoal.rows.length > 0) {
      goal = Number(lastGoal.rows[0].goal_amount);
      lastChanged = lastGoal.rows[0].changed_at;
    }
    const countResult = await pool.query('SELECT COUNT(*) FROM entra.goals');
    changesCount = Number(countResult.rows[0].count || 0);
  } catch (error) {
    console.log("Error fetching goal data:", error);
  }

  data.monthly_goal = goal;
  data.monthly_goal_formatted = "$" + Number(goal).toLocaleString();
  data.monthly_goal_last_changed = lastChanged;
  data.monthly_goal_changes_count = changesCount;

  res.render("config-headcarrier", data);
};

// El resto de tus métodos (no cambia)
const addHeadCarrier = (req, res) => {
  const { name, carrier_id } = req.body;
  pool.query(
    `INSERT INTO qq.head_carriers(name, contact_id) VALUES ($1, $2)`,
    [name, carrier_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Error, Head Carrier not inserted!`,
        });
      }
    }
  );
  pool.query(
    `UPDATE qq.contacts SET head_comp=$1 WHERE entity_id=$2`,
    [name, carrier_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Error, Head Carrier not updated in QQ!`,
        });
      }
    }
  );
  res.redirect('/users/config/headcarriers');
};

const head_carrier_list = (req, res) => {
  pool.query(
    `SELECT head_carrier_id, hc.name, tp.name AS type_display, c.display_name, c.created_on, c.date_last_modified, c.entity_id
     FROM qq.head_carriers hc
     INNER JOIN qq.contacts c ON contact_id = c.entity_id
     INNER JOIN qq.type_displays tp ON c.type_display = tp.type_display
     ORDER BY hc.name ASC`,
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `DataBase Error`,
          data: [],
        });
      }
      res.status(200).json({
        data: result.rows,
      });
    }
  );
};

const addCarrier = (req, res) => {
  const { name1, carrier_id } = req.body;
  pool.query(
    `INSERT INTO qq.head_carriers(name, contact_id) VALUES ($1, $2)`,
    [name1, carrier_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Insert carrier Error`,
        });
      }
    }
  );
  pool.query(
    `UPDATE qq.contacts SET head_comp=$1 WHERE entity_id=$2`,
    [name1, carrier_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Error, Head Carrier not updated in QQ!`,
        });
      }
    }
  );
  res.redirect('/users/config/headcarriers');
};

const deleteCarrier = (req, res) => {
  const { name2, contact_id } = req.body;
  pool.query(
    `DELETE FROM qq.head_carriers WHERE name = $1 AND contact_id = $2`,
    [name2, contact_id],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: `Delete carrier Error`,
        });
      }
    }
  );
  pool.query(
    `UPDATE qq.contacts SET head_comp=display_name WHERE entity_id=$1`,
    [contact_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Error, Head Carrier not updated in QQ!`,
        });
      }
    }
  );
  res.redirect('/users/config/headcarriers');
};

export {
  headcarrier,
  addHeadCarrier,
  head_carrier_list,
  addCarrier,
  deleteCarrier,
  setMonthlyGoal,           // para la ruta POST
  getMonthlyGoal            // para usar en el televisor y otros módulos
};