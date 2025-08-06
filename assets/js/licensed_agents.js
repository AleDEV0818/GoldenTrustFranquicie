// --- Flatpickr theme auto-switch ---
function setFlatpickrTheme() {
  const isDark = document.body.classList.contains('theme-dark') || document.body.classList.contains('dark-mode');
  const darkCss = document.getElementById('flatpickr-dark-theme');
  if (darkCss) darkCss.disabled = !isDark;
}
const observer = new MutationObserver(setFlatpickrTheme);
observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

$(document).ready(function () {
  // --- Utilities ---
  function formatDate(date) {
    if (!date) return "";
    const d = new Date(date);
    return d.toISOString().slice(0, 10);
  }
  function statusLabel(val) {
    return val ? "Active" : "Inactive";
  }
  function formatDateInput(date) {
    if (!date) return "";
    const d = new Date(date);
    return d.toISOString().slice(0, 10);
  }
  function calcDaysLeft(exp_date) {
    if (!exp_date) return "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(exp_date);
    exp.setHours(0, 0, 0, 0);
    return Math.floor((exp - today) / (1000 * 60 * 60 * 24)) + 1;
  }

  // --- Avatar utility ---
  function getAvatarHtml(name, user_id) {
    const safeName = (name || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const imgSrc = user_id ? `/img/avatars/users/${user_id}.png` : '';
    const initials = (name || "").split(' ').map(x => x[0]).join('').toUpperCase().substring(0, 2);
    return `
      <span class="d-inline-flex align-items-center gap-2">
        <img src="${imgSrc}" class="rounded-circle border shadow-sm me-2"
          style="width:38px;height:38px;object-fit:cover;"
          onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='inline-flex';">
        <span style="display:none;font-weight:600;font-size:1.1em;background:#eee;color:#333;border-radius:50%;width:38px;height:38px;align-items:center;justify-content:center;">${initials}</span>
      </span>
    `;
  }

  // --- Config ---
  const location_id = window.USER_LOCATION_ID;
  let allAgentsCache = [];

  // --- INIT SELECT2 FOR RECIPIENTS ---
  $('#mailUserSelect').select2({
    placeholder: 'Select recipient(s)...',
    allowClear: true,
    width: 'resolve'
  });

  // --- Show last mail sent info ---
  async function showLastMailSentInfo() {
    try {
      const resp = await $.get('/users/agents/last-expiring-mail');
      if (resp && resp.to && resp.at) {
        let toDisplay = Array.isArray(resp.to) ? resp.to.join(", ") : resp.to;
        const localTime = new Date(resp.at).toLocaleString();
        $('#mailSentInfo')
          .html(`Last expiring agents email sent to ${toDisplay} at ${localTime}.`)
          .show();
      } else {
        $('#mailSentInfo').hide();
      }
    } catch (err) {
      $('#mailSentInfo').hide();
    }
  }

  // --- Load mail recipients (admin.mail) and preselect saved ones ---
  async function loadMailUsers() {
    try {
      const resp = await $.get(`/users/mail-users?location_id=${location_id}`);
      const $sel = $('#mailUserSelect');
      $sel.empty();
      if (Array.isArray(resp) && resp.length > 0) {
        $('#mailUserRow').show();
        resp.forEach(u => {
          $sel.append(
            `<option value="${u.mail}">${u.display_name} (${u.mail})</option>`
          );
        });
        $sel.trigger('change.select2');
      } else {
        $('#mailUserRow').hide();
      }
      // Consultar destinatarios automáticos guardados y preseleccionar
      const selectedResp = await $.get(`/users/agents/auto-expiring-mail-recipients?location_id=${location_id}`);
      if (selectedResp && Array.isArray(selectedResp.to)) {
        $('#mailUserSelect').val(selectedResp.to).trigger('change');
      }
    } catch (err) {
      $('#mailUserRow').hide();
    }
  }

  $('#mailUserSelect').on('change', function () {
    const selected = $(this).select2('data').map(x => x.text).join(', ');
    $('#selectedRecipients').text(selected);
  });

  $('#saveAutoRecipientsBtn').on('click', async function () {
    const mails = $('#mailUserSelect').val();
    if (!mails || mails.length === 0) {
      alert('Please select at least one recipient for daily emails.');
      return;
    }
    try {
      const res = await fetch('/users/agents/set-auto-expiring-mail-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: mails, location_id })
      });
      const data = await res.json();
      if (data.success) {
        alert('Recipients saved for daily emails.');
        showLastMailSentInfo();
      } else {
        alert(data.error || "Error saving recipients.");
      }
    } catch (err) {
      alert('Failed to save recipients: ' + err.message);
    }
  });

$('#sendMailBtn').on('click', async function () {
  const $btn = $(this);
  if ($btn.prop('disabled')) return; // Previene doble click rápido
  $btn.prop('disabled', true);

  let mails = $('#mailUserSelect').val();
  if (!mails || mails.length === 0) {
    alert('Please select at least one recipient');
    $btn.prop('disabled', false);
    return;
  }
  // Elimina correos duplicados
  if (Array.isArray(mails)) {
    mails = [...new Set(mails)];
  }

  try {
    const res = await fetch('/users/agents/send-expiring-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: mails, location_id })
    });
    const data = await res.json();
    if (data.success) {
      alert('Manual email sent.');
      showLastMailSentInfo();
    } else if (data.msg) {
      alert(data.msg);
    } else {
      alert('Error sending email: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to send email: ' + err.message);
  }
  $btn.prop('disabled', false);
});

  function validateDates($issueInput, $expInput) {
    const issueDate = $issueInput.val();
    const expDate = $expInput.val();
    if (issueDate && expDate && issueDate > expDate) {
      return false;
    }
    return true;
  }

  // --- DataTable ---
  const table = $('#agentsTable').DataTable({
    columns: [
      {
        data: null,
        title: "Name",
        render: function (data, type, row) {
          return `
            <div class="d-flex align-items-center gap-3">
              ${getAvatarHtml(row.name, row.user_id || row.licensed_agent_id)}
              <div>
                <div style="font-size:1.05rem;font-weight:500;">${row.name || ""}</div>
                <div style="font-size:0.89rem;color:#555;line-height:1;margin-top:2px;">${row.job_title || ""}</div>
              </div>
            </div>
          `;
        }
      },
      { data: "email", title: "Email" },
      { data: "license_number", title: "License" },
      {
        data: "issue_date",
        title: "Issue Date",
        render: function (data, type, row) {
          const isInactive = !row.status || calcDaysLeft(row.exp_date) < 0;
          return isInactive ? "-" : formatDate(data);
        }
      },
      {
        data: "exp_date",
        title: "Exp Date",
        render: function (data, type, row) {
          const isInactive = !row.status || calcDaysLeft(row.exp_date) < 0;
          return isInactive ? "-" : formatDate(data);
        }
      },
      {
        data: "status",
        title: "Status",
        render: function (data, type, row) {
          const daysLeft = calcDaysLeft(row.exp_date);
          if (daysLeft < 0 || !data) {
            return `<span style="color:#d00;font-weight:bold;">Inactive</span>`;
          }
          return `<span style="color:#28a745;font-weight:bold;">Active</span>`;
        }
      },
      {
        data: "days_left",
        title: "Days Left",
        render: function (data, type, row) {
          const daysLeft = calcDaysLeft(row.exp_date);
          if (daysLeft < 0) {
            return `<span style="color:#d00;font-weight:bold;">Expired</span>`;
          }
          if (daysLeft <= 30) {
            return `<span style="color:#ffc107;font-weight:bold;">${daysLeft}</span>`;
          }
          return daysLeft;
        }
      },
      {
        data: null,
        title: "Action",
        orderable: false,
        render: function (data, type, row) {
          return `
            <button class="btn btn-sm btn-outline-secondary edit-agent-btn" data-agent-id="${row.licensed_agent_id || ""}">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger delete-agent-btn" data-agent-id="${row.licensed_agent_id || ""}">
              <i class="bi bi-trash"></i>
            </button>
          `;
        }
      }
    ],
    searching: false,
    paging: true,
    info: true,
    ordering: true,
    order: [[0, "asc"]],
    language: {
      emptyTable: "No agents found",
      info: "Showing _START_ to _END_ of _TOTAL_ agents",
      infoEmpty: "Showing 0 to 0 of 0 agents",
      infoFiltered: "(filtered from _MAX_ total agents)",
      lengthMenu: "Show _MENU_ agents",
      loadingRecords: "Loading...",
      processing: "Processing...",
      search: "Search:",
      zeroRecords: "No matching agents found",
      paginate: {
        first: "First",
        last: "Last",
        next: "Next",
        previous: "Previous"
      }
    },
    dom: 'lBftip',
    buttons: [],
    rowCallback: function (row, data) {
      if (calcDaysLeft(data.exp_date) < 0) {
        $(row).addClass('agente-vencido');
      }
    },
    initComplete: function () {
      if (!$('#activeOnlyBox').length) {
        const $lengthMenu = $('#agentsTable_length');
        $lengthMenu.css('display', 'flex').css('align-items', 'center');
        $lengthMenu.append(`
          <div style="margin-left:18px;">
            <label style="font-weight:normal;">
              <input type="checkbox" id="activeOnlyBox" style="margin-right:6px;">
              Hide Inactive Users
            </label>
          </div>
        `);
        $('#activeOnlyBox').on('change', function () {
          if ($(this).is(':checked')) {
            const filtered = allAgentsCache.filter(agent => agent.status === true && calcDaysLeft(agent.exp_date) >= 0);
            renderAgentsTable(filtered);
          } else {
            renderAgentsTable(allAgentsCache);
          }
        });
      }
    }
  });

// --- MODAL DETALLADO AL HACER CLICK EN LA FILA ---
$('#agentsTable tbody').on('click', 'tr', function (e) {
  if ($(e.target).closest('.edit-agent-btn, .delete-agent-btn').length) return;
  const agent = table.row(this).data();
  if (!agent) return;

  let modalHtml = `
    <div class="modal fade" id="agentDetailModal" tabindex="-1" aria-labelledby="agentDetailLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content shadow">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title fw-bold" id="agentDetailLabel">
              <i class="bi bi-person-circle me-2"></i>Agent Details
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body px-4 py-4">
            <div class="row">
              <div class="col-md-4 border-end text-center d-flex flex-column justify-content-center align-items-center">
                ${getAvatarHtml(agent.name, agent.user_id || agent.licensed_agent_id)}
                <div class="fw-bold fs-4 mt-3 mb-1">${agent.name || '-'}</div>
                <div class="text-muted mb-3">${agent.job_title || '-'}</div>
                <span class="badge bg-light text-dark px-3 py-2 mb-2" style="font-size:1.1em;">
                  ${statusLabel(agent.status)}
                </span>
                <div class="my-2">
                  <span class="small text-muted">Days Left</span>
                  <div class="fw-bold fs-5">${calcDaysLeft(agent.exp_date) ?? '-'}</div>
                </div>
              </div>
              <div class="col-md-8 px-3">
                <div class="row mb-2">
                  <div class="col-sm-6">
                    <span class="text-muted"><i class="bi bi-envelope me-1"></i>Email:</span>
                    <div class="fw-semibold">${agent.email || '-'}</div>
                  </div>
                  <div class="col-sm-6">
                    <span class="text-muted"><i class="bi bi-card-text me-1"></i>License:</span>
                    <div class="fw-semibold">${agent.license_number || '-'}</div>
                  </div>
                </div>
                <div class="row mb-2">
                  <div class="col-sm-6">
                    <span class="text-muted"><i class="bi bi-calendar-check me-1"></i>Issue Date:</span>
                    <div class="fw-semibold">${formatDate(agent.issue_date)}</div>
                  </div>
                  <div class="col-sm-6">
                    <span class="text-muted"><i class="bi bi-calendar-x me-1"></i>Exp Date:</span>
                    <div class="fw-semibold">${formatDate(agent.exp_date)}</div>
                  </div>
                </div>
                <div class="row mb-2">
                  <div class="col-sm-6">
                    <span class="text-muted"><i class="bi bi-info-circle me-1"></i>Status:</span>
                    <div class="fw-semibold">${statusLabel(agent.status)}</div>
                  </div>
                  <div class="col-sm-6">
                    <span class="text-muted"><i class="bi bi-hourglass-split me-1"></i>Days Left:</span>
                    <div class="fw-semibold">${calcDaysLeft(agent.exp_date)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  $('#agentDetailModal').remove();
  $('body').append(modalHtml);
  let modal = new bootstrap.Modal(document.getElementById('agentDetailModal'));
  modal.show();
});
  // --- Load Agents ---
  async function loadAgents() {
    try {
      const resp = await $.get(`/users/agents?location_id=${location_id}`);
      resp.forEach(agent => {
        if (!agent.licensed_agent_id && agent.licensed_id) {
          agent.licensed_agent_id = agent.licensed_id;
        } else if (!agent.licensed_agent_id && agent.id) {
          agent.licensed_agent_id = agent.id;
        }
      });
      allAgentsCache = resp;
      renderAgentsTable(resp);
      if ($('#activeOnlyBox').is(':checked')) {
        const filtered = allAgentsCache.filter(agent => agent.status === true && calcDaysLeft(agent.exp_date) >= 0);
        renderAgentsTable(filtered);
      }
    } catch (err) {
      allAgentsCache = [];
      renderAgentsTable([]);
      alert("Error loading agents");
    }
  }

  function renderAgentsTable(agents) {
    const filteredAgents = agents.filter(agent => agent.name);
    filteredAgents.forEach(agent => {
      if (typeof agent.days_left === 'undefined') {
        agent.days_left = calcDaysLeft(agent.exp_date);
      }
    });
    table.clear();
    table.rows.add(filteredAgents);
    table.draw();
  }

  // --- MODAL: Edit Agent ---
  $('#agentsTable tbody').on('click', '.edit-agent-btn', function () {
    const agent = table.row($(this).closest('tr')).data();
    if (!agent.licensed_agent_id) {
      alert('Error: Agent ID not found. Cannot edit this agent.');
      return;
    }

    $('#editAgentName').val(agent.name);
    $('#editAgentEmail').val(agent.email);
    $('#editLicenseNumber').val(agent.license_number);
    $('#editStatus').val(agent.status ? "true" : "false");
    $('#editIssueDate').val(formatDateInput(agent.issue_date));
    $('#editExpDate').val(formatDateInput(agent.exp_date));
    $('#editAgentForm').data('agentId', agent.licensed_agent_id);

    setTimeout(function () {
      setFlatpickrTheme();
      if ($('#editIssueDate')[0] && $('#editIssueDate')[0]._flatpickr) $('#editIssueDate')[0]._flatpickr.destroy();
      if ($('#editExpDate')[0] && $('#editExpDate')[0]._flatpickr) $('#editExpDate')[0]._flatpickr.destroy();
      flatpickr('#editIssueDate', { dateFormat: "Y-m-d", allowInput: true, clickOpens: true });
      flatpickr('#editExpDate', { dateFormat: "Y-m-d", allowInput: true, clickOpens: true });
    }, 100);

    const $editIssueDate = $('#editIssueDate');
    const $editExpDate = $('#editExpDate');

    $editIssueDate.on('change', function () {
      if (!validateDates($editIssueDate, $editExpDate)) {
        alert("Issue Date cannot be greater than Exp Date. Please select valid dates.");
        $editIssueDate.val('');
      }
    });
    $editExpDate.on('change', function () {
      if (!validateDates($editIssueDate, $editExpDate)) {
        alert("Exp Date cannot be less than Issue Date. Please select valid dates.");
        $editExpDate.val('');
      }
    });

    const modal = new bootstrap.Modal(document.getElementById('editAgentModal'));
    modal.show();
  });

  $('#agentsTable tbody').on('click', '.delete-agent-btn', async function () {
    const agent = table.row($(this).closest('tr')).data();
    if (!agent.licensed_agent_id) {
      alert('Error: Agent ID not found. Cannot delete this agent.');
      return;
    }
    if (!confirm('Are you sure you want to delete this agent?')) return;
    try {
      const res = await fetch(`/users/agents/${agent.licensed_agent_id}`, {
        method: "DELETE"
      });
      const contentType = res.headers.get("content-type");
      if (!res.ok) {
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          throw new Error(data.error || "Error deleting agent");
        } else {
          const text = await res.text();
          throw new Error("Error: " + text);
        }
      }
      await loadAgents();
      alert('Agent deleted');
    } catch (err) {
      alert(err.message);
    }
  });

  $('#editAgentModal').on('hidden.bs.modal', function () {
    if ($('#editIssueDate')[0] && $('#editIssueDate')[0]._flatpickr) $('#editIssueDate')[0]._flatpickr.destroy();
    if ($('#editExpDate')[0] && $('#editExpDate')[0]._flatpickr) $('#editExpDate')[0]._flatpickr.destroy();
    $('#editIssueDate').off('change');
    $('#editExpDate').off('change');
  });

  $('#editAgentForm').on('submit', async function (e) {
    e.preventDefault();
    const $editIssueDate = $('#editIssueDate');
    const $editExpDate = $('#editExpDate');
    if (!validateDates($editIssueDate, $editExpDate)) {
      alert("Issue Date cannot be greater than Exp Date. Please select valid dates.");
      return;
    }
    const agentId = $(this).data('agentId');
    if (!agentId) {
      alert('Error: No agent ID');
      return;
    }
    const editData = {
      license_number: $('#editLicenseNumber').val(),
      active: $('#editStatus').val() === "true",
      issue_date: $editIssueDate.val(),
      exp_date: $editExpDate.val()
    };

    try {
      const res = await fetch(`/users/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData)
      });
      if (!res.ok) {
        let msg = "Error updating agent";
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          msg = data.error || msg;
        } else {
          msg = await res.text();
        }
        throw new Error(msg);
      }
      await loadAgents();
      const modal = bootstrap.Modal.getInstance(document.getElementById('editAgentModal'));
      modal.hide();
    } catch (err) {
      alert(err.message);
    }
  });

  $('#exportBtn').on('click', function () {
    window.open(`/users/agents/export?location_id=${location_id}`, "_blank");
  });

  $('#addAgentBtn').on('click', async function () {
    $('#userSelect').empty();
    try {
      const [usersResp, agentsResp] = await Promise.all([
        $.get(`/users/agents/available-users?location_id=${location_id}`),
        $.get(`/users/agents?location_id=${location_id}`)
      ]);
      const licensedIds = new Set(agentsResp.map(a => a.user_id));
      if (Array.isArray(usersResp)) {
        usersResp
          .filter(u => !licensedIds.has(u.user_id))
          .forEach(u => {
            $('#userSelect').append(
              `<option value="${u.user_id}">${u.display_name}</option>`
            );
          });
      }
      if ($.fn.select2) {
        $('#userSelect').select2({
          dropdownParent: $('#addAgentDrawer .drawer'),
          width: '280px',
          placeholder: 'Select an agent'
        });
      }
      setTimeout(function () {
        setFlatpickrTheme();
        if ($('#issueDate')[0] && $('#issueDate')[0]._flatpickr) $('#issueDate')[0]._flatpickr.destroy();
        if ($('#expDate')[0] && $('#expDate')[0]._flatpickr) $('#expDate')[0]._flatpickr.destroy();
        if (typeof flatpickr !== 'undefined') {
          flatpickr('#issueDate', { dateFormat: "Y-m-d", allowInput: true, clickOpens: true });
          flatpickr('#expDate', { dateFormat: "Y-m-d", allowInput: true, clickOpens: true });
        }
      }, 100);

      const $addIssueDate = $('#issueDate');
      const $addExpDate = $('#expDate');
      $addIssueDate.on('change', function () {
        if (!validateDates($addIssueDate, $addExpDate)) {
          alert("Issue Date cannot be greater than Exp Date. Please select valid dates.");
          $addIssueDate.val('');
        }
      });
      $addExpDate.on('change', function () {
        if (!validateDates($addIssueDate, $addExpDate)) {
          alert("Exp Date cannot be less than Issue Date. Please select valid dates.");
          $addExpDate.val('');
        }
      });

    } catch (err) {
      alert('Error loading available users');
    }
    $('#addAgentDrawer').addClass('open');
    $('.drawer-overlay').addClass('open').show();
  });

  $('#closeDrawerBtn, #cancelDrawerBtn').on('click', function () {
    $('#addAgentDrawer').removeClass('open');
    $('.drawer-overlay').removeClass('open').hide();
    $('#addAgentForm')[0].reset();
    if ($.fn.select2) {
      $('#userSelect').val(null).trigger('change').select2('destroy');
    }
    if (typeof flatpickr !== 'undefined') {
      if ($('#issueDate')[0] && $('#issueDate')[0]._flatpickr) $('#issueDate')[0]._flatpickr.destroy();
      if ($('#expDate')[0] && $('#expDate')[0]._flatpickr) $('#expDate')[0]._flatpickr.destroy();
    }
    $('#issueDate').off('change');
    $('#expDate').off('change');
  });

  $('#addAgentForm').on('submit', async function (e) {
    e.preventDefault();
    const $addIssueDate = $('#issueDate');
    const $addExpDate = $('#expDate');
    if (!validateDates($addIssueDate, $addExpDate)) {
      alert("Issue Date cannot be greater than Exp Date. Please select valid dates.");
      return;
    }
    const agentData = {
      user_id: $('#userSelect').val(),
      license_number: $('#licenseNumber').val(),
      issue_date: $addIssueDate.val(),
      exp_date: $addExpDate.val(),
      active: $('#active').prop('checked'),
      location_id: location_id
    };
    try {
      const res = await fetch("/users/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData)
      });
      if (!res.ok) {
        let msg = "Error adding agent";
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          msg = data.error || msg;
        } else {
          msg = await res.text();
        }
        throw new Error(msg);
      }
      await loadAgents();
      $('#addAgentDrawer').removeClass('open');
      $('.drawer-overlay').removeClass('open').hide();
      $('#addAgentForm')[0].reset();
      if ($.fn.select2) {
        $('#userSelect').val(null).trigger('change').select2('destroy');
      }
      if (typeof flatpickr !== 'undefined') {
        if ($('#issueDate')[0] && $('#issueDate')[0]._flatpickr) $('#issueDate')[0]._flatpickr.destroy();
        if ($('#expDate')[0] && $('#expDate')[0]._flatpickr) $('#expDate')[0]._flatpickr.destroy();
      }
      $('#issueDate').off('change');
      $('#expDate').off('change');
    } catch (err) {
      alert(err.message);
    }
  });

  // --- INIT ---
  loadAgents();
  loadMailUsers();
  showLastMailSentInfo();
});