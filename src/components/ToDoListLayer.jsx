import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { Icon } from "@iconify/react/dist/iconify.js";
import { getToken } from "../api/getToken";

const RUN_STORED_PROCEDURE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=runStoredProcedure";

const API_HEADERS = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
  "Content-Type": "application/json",
};

const CREATED_BY_OPTIONS = ["Kamille", "Sanval", "Imran", "Gareth"];

const ASSIGNED_TO_OPTIONS = [
  "Kamille",
  "Sanval",
  "Imran",
  "Gareth",
  "Dev Team",
];

const ACTION_BY_OPTIONS = [...CREATED_BY_OPTIONS, "Dev Team"];

const PRIORITY_OPTIONS = ["Low", "Medium", "High"];

const EMPTY_FORM = {
  task_text: "",
  assigned_to: "",
  priority: "Medium",
  due_date: "",
  created_by_name: "",
};

const resolveToken = (tokenRes) => {
  if (typeof tokenRes === "string") return tokenRes;

  return (
    tokenRes?.token ||
    tokenRes?.Token ||
    tokenRes?.data?.token ||
    tokenRes?.data?.Token ||
    tokenRes?.data?.data?.token ||
    tokenRes?.access_token ||
    tokenRes?.data?.access_token ||
    ""
  );
};

const buildHeaders = async () => {
  const tokenRes = await getToken();
  const token = resolveToken(tokenRes);

  return {
    ...API_HEADERS,
    ...(token ? { token } : {}),
  };
};

const extractRows = (response) => {
  const candidates = [
    response,
    response?.data,
    response?.data?.data,
    response?.data?.result,
    response?.result,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
};

const runSP = async (procedureName, parameters = []) => {
  const headers = await buildHeaders();

  const response = await axios.post(
    RUN_STORED_PROCEDURE_URL,
    {
      procedureName,
      parameters,
    },
    {
      headers,
      timeout: 15000,
    }
  );

  if (Number(response?.data?.statusCode) !== 200) {
    throw new Error(
      response?.data?.message || `Failed to execute ${procedureName}`
    );
  }

  return response;
};

const toBoolean = (value) => {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value ?? "").toLowerCase() === "true"
  );
};

const normalizeTask = (item) => ({
  id: Number(item?.id),
  task_text: item?.task_text || "",
  assigned_to: item?.assigned_to || "",
  priority: item?.priority || "Medium",
  due_date: item?.due_date ? String(item.due_date).split(" ")[0] : "",
  is_completed: toBoolean(item?.is_completed),
  completed_by_name: item?.completed_by_name || "",
  completed_date: item?.completed_date || null,
  created_by_name: item?.created_by_name || "",
  createddate: item?.createddate || "",
  modified_by_name: item?.modified_by_name || "",
  modifieddate: item?.modifieddate || "",
});

const getInitials = (name = "") => {
  if (!name) return "?";

  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

const parseDateValue = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
  if (!value) return "-";

  const raw = String(value).split(" ")[0];
  const date = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const formatDateTime = (value) => {
  const date = parseDateValue(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getDueState = (value, completed) => {
  if (!value || completed) return { label: "", type: "" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${String(value).split(" ")[0]}T00:00:00`);
  due.setHours(0, 0, 0, 0);

  const difference = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (difference < 0) return { label: "Overdue", type: "overdue" };
  if (difference === 0) return { label: "Today", type: "today" };

  return {
    label: `In ${difference} ${difference === 1 ? "day" : "days"}`,
    type: "future",
  };
};

const priorityClass = (priority) => {
  if (priority === "High") return "todo-priority todo-priority-high";
  if (priority === "Low") return "todo-priority todo-priority-low";
  return "todo-priority todo-priority-medium";
};

const showSuccessToast = (title) => {
  return Swal.fire({
    icon: "success",
    title,
    toast: true,
    position: "top-end",
    timer: 1600,
    timerProgressBar: true,
    showConfirmButton: false,
  });
};

const styles = `
.todo-list-theme {
  --todo-card: #ffffff;
  --todo-soft: #f8fafc;
  --todo-border: #e5e7eb;
  --todo-text: #182230;
  --todo-muted: #667085;
  --todo-input: #ffffff;
  --todo-hover: #f8fafc;
  --todo-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
  color: var(--todo-text);
}

[data-bs-theme="dark"] .todo-list-theme,
[data-theme="dark"] .todo-list-theme,
.dark .todo-list-theme {
  --todo-card: #243247;
  --todo-soft: #1e2b3d;
  --todo-border: rgba(255,255,255,.09);
  --todo-text: #f8fafc;
  --todo-muted: #9caec3;
  --todo-input: #1c293b;
  --todo-hover: #29384f;
  --todo-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
}

.todo-card {
  background: var(--todo-card);
  border: 1px solid var(--todo-border);
  border-radius: 14px;
  box-shadow: var(--todo-shadow);
}

.todo-main-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}

.todo-heading-icon {
  width: 54px;
  height: 54px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 29px;
  border-radius: 12px;
  color: #4c8dff;
  background: rgba(72,127,255,.15);
  border: 1px solid rgba(72,127,255,.24);
}

.todo-muted { color: var(--todo-muted); }

.todo-stat-card {
  min-height: 100px;
  padding: 19px 20px;
  display: flex;
  align-items: center;
  gap: 15px;
}

.todo-stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 27px;
  flex-shrink: 0;
}

.todo-stat-blue { color: #0ea5e9; background: rgba(14,165,233,.15); }
.todo-stat-orange { color: #f59e0b; background: rgba(245,158,11,.17); }
.todo-stat-green { color: #22c55e; background: rgba(34,197,94,.15); }
.todo-stat-purple { color: #a855f7; background: rgba(168,85,247,.15); }

.todo-stat-number {
  color: var(--todo-text);
  font-size: 25px;
  line-height: 1;
  font-weight: 700;
  margin-bottom: 6px;
}

.todo-form-card { padding: 22px; }

.todo-label {
  display: block;
  margin-bottom: 7px;
  color: var(--todo-text);
  font-size: 13px;
  font-weight: 700;
}

.todo-input,
.todo-select,
.todo-textarea {
  width: 100%;
  border: 1px solid var(--todo-border);
  border-radius: 9px;
  background: var(--todo-input);
  color: var(--todo-text);
  outline: none;
  transition: .2s ease;
}

.todo-input,
.todo-select {
  min-height: 45px;
  padding: 9px 12px;
}

.todo-textarea {
  padding: 12px 14px;
  min-height: 118px;
  resize: vertical;
  line-height: 1.55;
}

.todo-input:focus,
.todo-select:focus,
.todo-textarea:focus {
  border-color: #487fff;
  box-shadow: 0 0 0 3px rgba(72,127,255,.12);
}

.todo-add-side {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.todo-tabs {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--todo-border);
}

.todo-tab {
  position: relative;
  border: 0;
  background: transparent;
  color: var(--todo-muted);
  font-weight: 700;
  font-size: 13px;
  padding: 13px 18px;
}

.todo-tab.active { color: #487fff; }

.todo-tab.active::after {
  position: absolute;
  content: "";
  left: 0;
  right: 0;
  height: 3px;
  bottom: -1px;
  border-radius: 10px 10px 0 0;
  background: #487fff;
}

.todo-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.todo-toolbar-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.todo-search-wrap {
  position: relative;
  width: 230px;
}

.todo-search-icon {
  position: absolute;
  top: 50%;
  left: 13px;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
  font-size: 18px;
}

.todo-search-wrap .todo-input { padding-left: 39px; }

.todo-table-wrapper {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--todo-border);
  border-radius: 12px;
  background: var(--todo-card);
}

.todo-table {
  width: 100%;
  min-width: 1220px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.todo-table thead th {
  padding: 14px 12px;
  font-size: 12px;
  font-weight: 800;
  background: var(--todo-soft);
  color: var(--todo-text);
  border-bottom: 1px solid var(--todo-border);
  white-space: nowrap;
}

.todo-table tbody td {
  padding: 14px 12px;
  font-size: 13px;
  background: var(--todo-card);
  color: var(--todo-text);
  border-bottom: 1px solid var(--todo-border);
  vertical-align: middle;
}

.todo-table tbody tr:last-child td { border-bottom: 0; }
.todo-table tbody tr:hover td { background: var(--todo-hover); }

.todo-col-done { width: 68px; text-align: center; }
.todo-col-number { width: 52px; text-align: center; }
.todo-col-task { width: 33%; }
.todo-col-priority { width: 110px; }
.todo-col-person { width: 145px; }
.todo-col-date { width: 145px; }
.todo-col-status { width: 165px; }
.todo-col-actions { width: 138px; }

.todo-complete-box {
  width: 29px;
  height: 29px;
  border-radius: 7px;
  border: 1px solid #64748b;
  background: transparent;
  color: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: .2s ease;
}

.todo-complete-box:hover {
  border-color: #487fff;
  background: rgba(72,127,255,.08);
}

.todo-complete-box.checked {
  border-color: #487fff;
  background: #487fff;
  color: #ffffff;
}

.todo-complete-box:disabled { opacity: .6; cursor: not-allowed; }

.todo-task-title {
  font-weight: 700;
  color: var(--todo-text);
  font-size: 14px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.todo-task-title.completed {
  text-decoration: line-through;
  opacity: .62;
}

.todo-task-preview {
  color: var(--todo-muted);
  font-size: 11px;
  margin-top: 5px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.todo-small {
  color: var(--todo-muted);
  font-size: 11px;
  margin-top: 3px;
}

.todo-person {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  min-width: 0;
}

.todo-person-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-avatar {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #a5b4fc;
  color: #1e1b4b;
  font-size: 10px;
  font-weight: 800;
}

.todo-priority {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 9px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 800;
}

.todo-priority-high {
  color: #ef4444;
  border: 1px solid rgba(239,68,68,.30);
  background: rgba(239,68,68,.13);
}

.todo-priority-medium {
  color: #3b82f6;
  border: 1px solid rgba(59,130,246,.30);
  background: rgba(59,130,246,.13);
}

.todo-priority-low {
  color: #22c55e;
  border: 1px solid rgba(34,197,94,.30);
  background: rgba(34,197,94,.13);
}

.todo-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 9px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 800;
}

.todo-status-pending {
  color: #f59e0b;
  border: 1px solid rgba(245,158,11,.30);
  background: rgba(245,158,11,.13);
}

.todo-status-completed {
  color: #22c55e;
  border: 1px solid rgba(34,197,94,.30);
  background: rgba(34,197,94,.13);
}

.todo-due-overdue { color: #ef4444; font-size: 11px; font-weight: 800; margin-top: 3px; }
.todo-due-today { color: #f59e0b; font-size: 11px; font-weight: 800; margin-top: 3px; }

.todo-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.todo-action {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  transition: .18s ease;
}

.todo-action-view { color: #8b5cf6; border: 1px solid rgba(139,92,246,.55); }
.todo-action-edit { color: #1688ff; border: 1px solid rgba(22,136,255,.55); }
.todo-action-delete { color: #ef4444; border: 1px solid rgba(239,68,68,.55); }
.todo-action:hover { transform: translateY(-1px); }
.todo-action:disabled { opacity: .55; cursor: not-allowed; transform: none; }

.todo-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2,6,23,.72);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}


.todo-modal {
  width: min(760px, 100%);
  background: var(--todo-card);
  border: 1px solid var(--todo-border);
  border-radius: 16px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 70px rgba(0,0,0,.28);
}

.todo-view-modal { width: min(880px, 100%); }

.todo-modal-header {
  padding: 19px 22px;
  border-bottom: 1px solid var(--todo-border);
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--todo-card);
}

.todo-view-task-box {
  padding: 18px;
  border: 1px solid var(--todo-border);
  background: var(--todo-soft);
  border-radius: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  font-size: 15px;
  color: var(--todo-text);
}

.todo-detail-card {
  height: 100%;
  padding: 14px;
  border: 1px solid var(--todo-border);
  background: var(--todo-soft);
  border-radius: 11px;
}

.todo-detail-label {
  color: var(--todo-muted);
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.todo-detail-value {
  color: var(--todo-text);
  font-size: 13px;
  font-weight: 700;
  word-break: break-word;
}


.todo-action-modal {
  width: min(520px, 100%);
  background: var(--todo-card);
  border: 1px solid var(--todo-border);
  border-radius: 18px;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.34);
  overflow: hidden;
  color: var(--todo-text);
}

.todo-action-modal-head {
  padding: 26px 26px 18px;
  text-align: center;
}

.todo-action-modal-icon {
  width: 62px;
  height: 62px;
  margin: 0 auto 14px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 31px;
}

.todo-action-modal-icon.complete {
  background: rgba(34,197,94,.15);
  color: #22c55e;
}

.todo-action-modal-icon.reopen {
  background: rgba(59,130,246,.15);
  color: #3b82f6;
}

.todo-action-modal-icon.delete {
  background: rgba(239,68,68,.14);
  color: #ef4444;
}

.todo-action-modal-body {
  padding: 0 26px 26px;
}

.todo-action-task-preview {
  padding: 13px 14px;
  margin-bottom: 18px;
  border: 1px solid var(--todo-border);
  background: var(--todo-soft);
  border-radius: 10px;
  color: var(--todo-text);
  font-size: 13px;
  line-height: 1.55;
  max-height: 92px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.todo-action-modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 18px;
}

.todo-action-confirm-danger {
  background: #dc3545 !important;
  border-color: #dc3545 !important;
  color: #fff !important;
}

.todo-action-confirm-success {
  background: #16a34a !important;
  border-color: #16a34a !important;
  color: #fff !important;
}

.todo-completed-note {
  margin-top: 5px;
  color: var(--todo-muted);
  font-size: 11px;
  line-height: 1.45;
}

.todo-page-button {
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--todo-border);
  color: var(--todo-text);
  background: var(--todo-card);
  border-radius: 8px;
}

.todo-page-button.active {
  color: #ffffff;
  background: #487fff;
  border-color: #487fff;
}

.todo-empty {
  padding: 46px 20px;
  text-align: center;
}

@media (max-width: 1199px) {
  .todo-add-side { gap: 16px; }
}

@media (max-width: 767px) {
  .todo-main-heading { align-items: flex-start; }
  .todo-heading-icon { width: 48px; height: 48px; font-size: 25px; }
  .todo-form-card { padding: 16px; }
  .todo-tabs { overflow-x: auto; }
  .todo-tab { white-space: nowrap; }
  .todo-search-wrap,
  .todo-toolbar-filters,
  .todo-toolbar-filters .todo-select,
  .todo-toolbar-filters .btn { width: 100% !important; }
  .todo-modal-backdrop { padding: 10px; align-items: flex-start; overflow-y: auto; }
  .todo-modal { max-height: none; margin: 10px 0; }
}
`;

const StatCard = ({ icon, iconClass, value, label }) => (
  <div className="col-xl-3 col-md-6">
    <div className="todo-card todo-stat-card">
      <div className={`todo-stat-icon ${iconClass}`}>
        <Icon icon={icon} />
      </div>
      <div>
        <div className="todo-stat-number">{value}</div>
        <div className="todo-muted">{label}</div>
      </div>
    </div>
  </div>
);

const PersonDisplay = ({ name }) => (
  <div className="todo-person">
    <span className="todo-avatar">{getInitials(name)}</span>
    <span className="todo-person-name">{name || "-"}</span>
  </div>
);

const DetailCard = ({ label, children }) => (
  <div className="todo-detail-card">
    <div className="todo-detail-label">{label}</div>
    <div className="todo-detail-value">{children || "-"}</div>
  </div>
);


const TaskActionModal = ({
  state,
  onClose,
  onConfirm,
  saving,
}) => {
  const [actorName, setActorName] = useState("");

  useEffect(() => {
    setActorName("");
  }, [state?.type, state?.task?.id]);

  if (!state?.task) return null;

  const { type, task } = state;

  const isComplete = type === "complete";
  const isReopen = type === "reopen";
  const isDelete = type === "delete";

  const title = isComplete
    ? "Complete Task"
    : isReopen
    ? "Reopen Task"
    : "Delete Task";

  const description = isComplete
    ? "Confirm who completed this task."
    : isReopen
    ? "Confirm who is reopening this task."
    : "This task will be removed from the active To Do List.";

  const fieldLabel = isComplete
    ? "Completed By"
    : isReopen
    ? "Reopened By"
    : "Deleted By";

  const icon = isComplete
    ? "solar:check-circle-bold-duotone"
    : isReopen
    ? "solar:restart-bold-duotone"
    : "solar:trash-bin-trash-bold-duotone";

  const iconClass = isComplete ? "complete" : isReopen ? "reopen" : "delete";

  const actorOptions = isComplete || isReopen
    ? ACTION_BY_OPTIONS
    : CREATED_BY_OPTIONS;

  const confirmText = isComplete
    ? "Complete Task"
    : isReopen
    ? "Reopen Task"
    : "Delete Task";

  const submit = (event) => {
    event.preventDefault();
    if (!actorName || saving) return;
    onConfirm(actorName);
  };

  return (
    <div className="todo-modal-backdrop" role="dialog" aria-modal="true">
      <div className="todo-action-modal">
        <form onSubmit={submit}>
          <div className="todo-action-modal-head">
            <div className={`todo-action-modal-icon ${iconClass}`}>
              <Icon icon={icon} />
            </div>

            <h5 className="fw-bold mb-2">{title}</h5>
            <div className="todo-muted" style={{ fontSize: 13 }}>
              {description}
            </div>
          </div>

          <div className="todo-action-modal-body">
            <div className="todo-action-task-preview">
              {task.task_text || "-"}
            </div>

            <label className="todo-label">{fieldLabel} *</label>
            <select
              className="todo-select"
              value={actorName}
              onChange={(event) => setActorName(event.target.value)}
              autoFocus
              disabled={saving}
            >
              <option value="">Select team member</option>
              {actorOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            {isComplete && (
              <div className="todo-completed-note">
                Kamille, Sanval, Imran, Gareth and Dev Team can be selected as the person or team completing the task.
              </div>
            )}

            <div className="todo-action-modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary px-4"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className={`btn px-4 ${
                  isDelete
                    ? "todo-action-confirm-danger"
                    : isComplete
                    ? "todo-action-confirm-success"
                    : "btn-primary"
                }`}
                disabled={!actorName || saving}
              >
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    Please wait
                  </>
                ) : (
                  confirmText
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditTaskModal = ({ task, open, onClose, onSave, saving }) => {
  const [form, setForm] = useState({
    task_text: "",
    assigned_to: "",
    priority: "Medium",
    due_date: "",
    updated_by_name: "",
  });

  useEffect(() => {
    if (!task) return;

    setForm({
      task_text: task.task_text || "",
      assigned_to: task.assigned_to || "",
      priority: task.priority || "Medium",
      due_date: task.due_date || "",
      updated_by_name: "",
    });
  }, [task]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();

    if (!form.task_text.trim()) {
      Swal.fire("Task Required", "Please enter the task details.", "warning");
      return;
    }

    if (!form.assigned_to) {
      Swal.fire("Assigned To Required", "Please select a team member.", "warning");
      return;
    }

    if (!form.updated_by_name) {
      Swal.fire("Updated By Required", "Please select who is updating this task.", "warning");
      return;
    }

    onSave(form);
  };

  return (
    <div className="todo-modal-backdrop">
      <div className="todo-modal">
        <div className="todo-modal-header d-flex justify-content-between align-items-center gap-3">
          <div>
            <h5 className="fw-bold mb-1">Edit Task</h5>
            <div className="todo-muted" style={{ fontSize: 12 }}>
              Update task details without changing the original creator.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Close
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="p-4">
            <div className="mb-3">
              <label className="todo-label">Task / Note *</label>
              <textarea
                className="todo-textarea"
                style={{ minHeight: 160 }}
                value={form.task_text}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, task_text: e.target.value }))
                }
              />
            </div>

            <div className="row g-3">
              <div className="col-md-6">
                <label className="todo-label">Assigned To *</label>
                <select
                  className="todo-select"
                  value={form.assigned_to}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, assigned_to: e.target.value }))
                  }
                >
                  <option value="">Select team member</option>
                  {ASSIGNED_TO_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-6">
                <label className="todo-label">Priority</label>
                <select
                  className="todo-select"
                  value={form.priority}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, priority: e.target.value }))
                  }
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-6">
                <label className="todo-label">Due Date</label>
                <input
                  type="date"
                  className="todo-input"
                  value={form.due_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, due_date: e.target.value }))
                  }
                />
              </div>

              <div className="col-md-6">
                <label className="todo-label">Updated By *</label>
                <select
                  className="todo-select"
                  value={form.updated_by_name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, updated_by_name: e.target.value }))
                  }
                >
                  <option value="">Select admin</option>
                  {CREATED_BY_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Updating..." : "Update Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ViewTaskModal = ({ task, open, onClose }) => {
  if (!open || !task) return null;

  return (
    <div className="todo-modal-backdrop">
      <div className="todo-modal todo-view-modal">
        <div className="todo-modal-header d-flex justify-content-between align-items-center gap-3">
          <div>
            <h5 className="fw-bold mb-1">Task Details</h5>
            <div className="todo-muted" style={{ fontSize: 12 }}>
              Full task information and completion history.
            </div>
          </div>

          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4">
            <label className="todo-label">Task / Note</label>
            <div className="todo-view-task-box">{task.task_text || "-"}</div>
          </div>

          <div className="row g-3">
            <div className="col-md-4">
              <DetailCard label="Status">
                <span
                  className={`todo-status ${
                    task.is_completed
                      ? "todo-status-completed"
                      : "todo-status-pending"
                  }`}
                >
                  <Icon
                    icon={
                      task.is_completed
                        ? "solar:check-circle-bold"
                        : "solar:clock-circle-bold"
                    }
                  />
                  {task.is_completed ? "Completed" : "Pending"}
                </span>
              </DetailCard>
            </div>

            <div className="col-md-4">
              <DetailCard label="Priority">
                <span className={priorityClass(task.priority)}>
                  <Icon icon="solar:flag-bold" />
                  {task.priority}
                </span>
              </DetailCard>
            </div>

            <div className="col-md-4">
              <DetailCard label="Due Date">{formatDate(task.due_date)}</DetailCard>
            </div>

            <div className="col-md-6">
              <DetailCard label="Assigned To">
                <PersonDisplay name={task.assigned_to} />
              </DetailCard>
            </div>

            <div className="col-md-6">
              <DetailCard label="Created By">
                <PersonDisplay name={task.created_by_name} />
              </DetailCard>
            </div>

            <div className="col-md-6">
              <DetailCard label="Created Date">
                {formatDateTime(task.createddate)}
              </DetailCard>
            </div>

            <div className="col-md-6">
              <DetailCard label="Last Updated">
                {task.modifieddate ? formatDateTime(task.modifieddate) : "Never updated"}
              </DetailCard>
            </div>

            <div className="col-md-6">
              <DetailCard label="Last Updated By">
                {task.modified_by_name || "-"}
              </DetailCard>
            </div>

            <div className="col-md-6">
              <DetailCard label="Completed By">
                {task.is_completed ? task.completed_by_name || "-" : "Not completed"}
              </DetailCard>
            </div>

            <div className="col-md-6">
              <DetailCard label="Completed Date">
                {task.is_completed
                  ? formatDateTime(task.completed_date)
                  : "Not completed"}
              </DetailCard>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 d-flex justify-content-end">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const ToDoListLayer = () => {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewingTask, setViewingTask] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [toggleId, setToggleId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 8;

  const fetchTasks = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      const response = await runSP("sp_get_admin_todo_tasks", []);
      const rows = extractRows(response.data).map(normalizeTask);
      setTasks(rows);
    } catch (error) {
      console.error("Fetch To Do Tasks Error:", error);

      if (!silent) {
        await Swal.fire({
          icon: "error",
          title: "Unable to Load Tasks",
          text:
            error?.response?.data?.message ||
            error?.message ||
            "Something went wrong while loading tasks.",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    const hasModal = Boolean(actionModal || editingTask || viewingTask);

    if (hasModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [actionModal, editingTask, viewingTask]);

  const stats = useMemo(() => {
    const pending = tasks.filter((item) => !item.is_completed).length;
    const completed = tasks.filter((item) => item.is_completed).length;

    return {
      total: tasks.length,
      pending,
      completed,
      team: ASSIGNED_TO_OPTIONS.length,
    };
  }, [tasks]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.is_completed !== b.is_completed) {
        return a.is_completed ? 1 : -1;
      }

      if (!a.is_completed && !b.is_completed) {
        const aDue = a.due_date
          ? new Date(`${a.due_date}T00:00:00`).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bDue = b.due_date
          ? new Date(`${b.due_date}T00:00:00`).getTime()
          : Number.MAX_SAFE_INTEGER;

        if (aDue !== bDue) return aDue - bDue;
      }

      return Number(b.id) - Number(a.id);
    });
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return sortedTasks.filter((item) => {
      if (activeTab === "pending" && item.is_completed) return false;
      if (activeTab === "completed" && !item.is_completed) return false;

      if (assigneeFilter && item.assigned_to !== assigneeFilter) return false;
      if (priorityFilter && item.priority !== priorityFilter) return false;

      if (search) {
        const text = [
          item.task_text,
          item.assigned_to,
          item.created_by_name,
          item.completed_by_name,
          item.modified_by_name,
          item.priority,
          item.due_date,
        ]
          .join(" ")
          .toLowerCase();

        if (!text.includes(search)) return false;
      }

      return true;
    });
  }, [
    sortedTasks,
    activeTab,
    searchTerm,
    assigneeFilter,
    priorityFilter,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, assigneeFilter, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const visibleTasks = filteredTasks.slice(startIndex, startIndex + itemsPerPage);

  const paginationPages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = new Set([1, totalPages, safePage - 1, safePage, safePage + 1]);
    return [...pages]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);
  }, [totalPages, safePage]);

  const resetFilters = () => {
    setSearchTerm("");
    setAssigneeFilter("");
    setPriorityFilter("");
    setCurrentPage(1);
  };

  const handleAddTask = async () => {
    if (!form.task_text.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Task Required",
        text: "Please enter a task or note.",
      });
      return;
    }

    if (!form.assigned_to) {
      await Swal.fire({
        icon: "warning",
        title: "Assignee Required",
        text: "Please select a team member.",
      });
      return;
    }

    if (!form.created_by_name) {
      await Swal.fire({
        icon: "warning",
        title: "Created By Required",
        text: "Please select who created the task.",
      });
      return;
    }

    try {
      setSaving(true);

      await runSP("sp_add_admin_todo_task", [
        form.task_text.trim(),
        form.assigned_to,
        form.priority,
        form.due_date || null,
        form.created_by_name,
      ]);

      setForm(EMPTY_FORM);
      await fetchTasks({ silent: true });
      setActiveTab("all");
      setCurrentPage(1);
      await showSuccessToast("Task Added");
    } catch (error) {
      console.error("Add Task Error:", error);

      await Swal.fire({
        icon: "error",
        title: "Failed to Add Task",
        text:
          error?.response?.data?.message ||
          error?.message ||
          "Unable to add task.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTask = async (updatedForm) => {
    if (!editingTask?.id) return;

    try {
      setUpdating(true);

      await runSP("sp_update_admin_todo_task", [
        Number(editingTask.id),
        updatedForm.task_text.trim(),
        updatedForm.assigned_to,
        updatedForm.priority,
        updatedForm.due_date || null,
        updatedForm.updated_by_name,
      ]);

      setEditingTask(null);
      await fetchTasks({ silent: true });
      await showSuccessToast("Task Updated");
    } catch (error) {
      console.error("Update Task Error:", error);

      await Swal.fire({
        icon: "error",
        title: "Update Failed",
        text:
          error?.response?.data?.message ||
          error?.message ||
          "Unable to update task.",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleTask = (task) => {
    if (!task?.id || actionSaving) return;

    setActionModal({
      type: task.is_completed ? "reopen" : "complete",
      task,
    });
  };

  const handleDeleteTask = (task) => {
    if (!task?.id || actionSaving) return;

    setActionModal({
      type: "delete",
      task,
    });
  };

  const handleConfirmTaskAction = async (actorName) => {
    if (!actionModal?.task?.id || !actorName || actionSaving) return;

    const { type, task } = actionModal;
    const isDelete = type === "delete";
    const nextValue = type === "complete" ? 1 : 0;

    try {
      setActionSaving(true);

      if (isDelete) {
        setDeleteId(task.id);

        await runSP("sp_delete_admin_todo_task", [
          Number(task.id),
          actorName,
        ]);

        if (viewingTask?.id === task.id) setViewingTask(null);
        if (editingTask?.id === task.id) setEditingTask(null);
      } else {
        setToggleId(task.id);

        // Current SP:
        // p_id, p_is_completed, p_completed_by_name, p_modified_by_name
        await runSP("sp_toggle_admin_todo_task", [
          Number(task.id),
          nextValue,
          nextValue === 1 ? actorName : null,
          actorName,
        ]);
      }

      setActionModal(null);
      await fetchTasks({ silent: true });

      await showSuccessToast(
        isDelete
          ? "Task Deleted"
          : nextValue
          ? "Task Completed"
          : "Task Reopened"
      );
    } catch (error) {
      console.error("Task Action Error:", error);

      await Swal.fire({
        icon: "error",
        title: isDelete ? "Delete Failed" : "Status Update Failed",
        text:
          error?.response?.data?.message ||
          error?.message ||
          "Unable to update the task.",
      });
    } finally {
      setActionSaving(false);
      setToggleId(null);
      setDeleteId(null);
    }
  };

  const filtersActive = Boolean(searchTerm || assigneeFilter || priorityFilter);

  return (
    <div className="todo-list-theme">
      <style>{styles}</style>

      <div className="d-flex flex-column gap-4">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div className="todo-main-heading">
            <div className="todo-heading-icon">
              <Icon icon="solar:checklist-minimalistic-bold-duotone" />
            </div>

            <div>
              <h4 className="fw-bold mb-1">To Do List</h4>
              <div className="todo-muted">
                Organise tasks, assign them to your team and keep track of progress.
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => fetchTasks()}
            disabled={loading}
          >
            <Icon icon="solar:refresh-outline" className="me-2" />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="row g-3">
          <StatCard
            icon="solar:list-check-bold-duotone"
            iconClass="todo-stat-blue"
            value={stats.total}
            label="Total Tasks"
          />
          <StatCard
            icon="solar:clock-circle-bold-duotone"
            iconClass="todo-stat-orange"
            value={stats.pending}
            label="Pending"
          />
          <StatCard
            icon="solar:check-circle-bold-duotone"
            iconClass="todo-stat-green"
            value={stats.completed}
            label="Completed"
          />
          <StatCard
            icon="solar:users-group-rounded-bold-duotone"
            iconClass="todo-stat-purple"
            value={stats.team}
            label="Team Members"
          />
        </div>

        <div className="todo-card todo-form-card">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <div>
              <h5 className="fw-bold mb-1">Add a New Task</h5>
              <div className="todo-muted" style={{ fontSize: 12 }}>
                Add the full task details, assign ownership and set a due date.
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-xl-6">
              <label className="todo-label">Task / Note *</label>
              <textarea
                className="todo-textarea"
                placeholder="Type the full task, job or note here..."
                value={form.task_text}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, task_text: e.target.value }))
                }
              />
              <div className="todo-small">
                Long text is supported. The table shows a short preview and View shows the full task.
              </div>
            </div>

            <div className="col-xl-6">
              <div className="todo-add-side">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="todo-label">Assign To *</label>
                    <select
                      className="todo-select"
                      value={form.assigned_to}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, assigned_to: e.target.value }))
                      }
                    >
                      <option value="">Select team member</option>
                      {ASSIGNED_TO_OPTIONS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="todo-label">Created By *</label>
                    <select
                      className="todo-select"
                      value={form.created_by_name}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          created_by_name: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select admin</option>
                      {CREATED_BY_OPTIONS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="todo-label">Priority</label>
                    <select
                      className="todo-select"
                      value={form.priority}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, priority: e.target.value }))
                      }
                    >
                      {PRIORITY_OPTIONS.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="todo-label">Due Date</label>
                    <input
                      type="date"
                      className="todo-input"
                      value={form.due_date}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, due_date: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setForm(EMPTY_FORM)}
                    disabled={saving}
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary px-4"
                    onClick={handleAddTask}
                    disabled={saving}
                  >
                    <Icon icon="solar:add-circle-linear" className="me-2" />
                    {saving ? "Adding..." : "Add Task"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="todo-toolbar mb-3">
            <div className="todo-tabs">
              <button
                type="button"
                className={`todo-tab ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                All Tasks ({stats.total})
              </button>

              <button
                type="button"
                className={`todo-tab ${activeTab === "pending" ? "active" : ""}`}
                onClick={() => setActiveTab("pending")}
              >
                Pending ({stats.pending})
              </button>

              <button
                type="button"
                className={`todo-tab ${activeTab === "completed" ? "active" : ""}`}
                onClick={() => setActiveTab("completed")}
              >
                Completed ({stats.completed})
              </button>
            </div>

            <div className="todo-toolbar-filters">
              <div className="todo-search-wrap">
                <Icon icon="solar:magnifer-linear" className="todo-search-icon" />
                <input
                  type="text"
                  className="todo-input"
                  placeholder="Search tasks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <select
                className="todo-select"
                style={{ width: 175 }}
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
              >
                <option value="">All Assignees</option>
                {ASSIGNED_TO_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                className="todo-select"
                style={{ width: 155 }}
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="">All Priorities</option>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>

              {filtersActive && (
                <button type="button" className="btn btn-outline-secondary" onClick={resetFilters}>
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          <div className="todo-table-wrapper">
            <table className="todo-table">
              <thead>
                <tr>
                  <th className="todo-col-done">Done</th>
                  <th className="todo-col-number">#</th>
                  <th className="todo-col-task">Task</th>
                  <th className="todo-col-priority">Priority</th>
                  <th className="todo-col-person">Assigned To</th>
                  <th className="todo-col-person">Created By</th>
                  <th className="todo-col-date">Due Date</th>
                  <th className="todo-col-status">Status</th>
                  <th className="todo-col-actions">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="todo-empty">
                      <div className="spinner-border text-primary" role="status" />
                      <div className="todo-muted mt-2">Loading tasks...</div>
                    </td>
                  </tr>
                ) : visibleTasks.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="todo-empty">
                      <Icon
                        icon="solar:clipboard-remove-linear"
                        style={{ fontSize: 42, color: "#94a3b8" }}
                      />
                      <div className="fw-semibold mt-2">No tasks found</div>
                      <div className="todo-muted mt-1" style={{ fontSize: 12 }}>
                        Add a task or adjust your filters.
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleTasks.map((task, index) => {
                    const dueState = getDueState(task.due_date, task.is_completed);

                    return (
                      <tr key={task.id}>
                        <td className="todo-col-done">
                          <button
                            type="button"
                            className={`todo-complete-box ${
                              task.is_completed ? "checked" : ""
                            }`}
                            title={task.is_completed ? "Reopen task" : "Mark task complete"}
                            aria-label={
                              task.is_completed ? "Reopen task" : "Mark task complete"
                            }
                            aria-pressed={task.is_completed}
                            disabled={toggleId === task.id}
                            onClick={() => handleToggleTask(task)}
                          >
                            {toggleId === task.id ? (
                              <span
                                className="spinner-border spinner-border-sm"
                                role="status"
                              />
                            ) : (
                              <Icon icon="solar:check-read-linear" />
                            )}
                          </button>
                        </td>

                        <td className="todo-col-number">{startIndex + index + 1}</td>

                        <td className="todo-col-task">
                          <div
                            className={`todo-task-title ${
                              task.is_completed ? "completed" : ""
                            }`}
                            title={task.task_text}
                          >
                            {task.task_text}
                          </div>

                          <div className="todo-task-preview">
                            <span>Created {formatDate(task.createddate)}</span>
                            {task.modifieddate && <span>Updated {formatDate(task.modifieddate)}</span>}
                          </div>
                        </td>

                        <td className="todo-col-priority">
                          <span className={priorityClass(task.priority)}>
                            <Icon icon="solar:flag-bold" />
                            {task.priority}
                          </span>
                        </td>

                        <td className="todo-col-person">
                          <PersonDisplay name={task.assigned_to} />
                        </td>

                        <td className="todo-col-person">
                          <PersonDisplay name={task.created_by_name} />
                        </td>

                        <td className="todo-col-date">
                          <div className="fw-semibold">{formatDate(task.due_date)}</div>

                          {dueState.type === "overdue" && (
                            <div className="todo-due-overdue">{dueState.label}</div>
                          )}

                          {dueState.type === "today" && (
                            <div className="todo-due-today">{dueState.label}</div>
                          )}

                          {dueState.type === "future" && (
                            <div className="todo-small">{dueState.label}</div>
                          )}
                        </td>

                        <td className="todo-col-status">
                          <span
                            className={`todo-status ${
                              task.is_completed
                                ? "todo-status-completed"
                                : "todo-status-pending"
                            }`}
                          >
                            <Icon
                              icon={
                                task.is_completed
                                  ? "solar:check-circle-bold"
                                  : "solar:clock-circle-bold"
                              }
                            />
                            {task.is_completed ? "Completed" : "Pending"}
                          </span>

                          {task.is_completed && (
                            <>
                              <div className="todo-small">
                                by {task.completed_by_name || "-"}
                              </div>
                              <div className="todo-small">
                                {formatDateTime(task.completed_date)}
                              </div>
                            </>
                          )}
                        </td>

                        <td className="todo-col-actions">
                          <div className="todo-actions">
                            <button
                              type="button"
                              title="View Full Task"
                              className="todo-action todo-action-view"
                              onClick={() => setViewingTask(task)}
                            >
                              <Icon icon="solar:eye-linear" />
                            </button>

                            <button
                              type="button"
                              className="todo-action todo-action-edit"
                              onClick={() => setEditingTask(task)}
                              disabled={
                                task.is_completed ||
                                Boolean(deleteId) ||
                                Boolean(toggleId) ||
                                actionSaving
                              }
                              title={
                                task.is_completed
                                  ? "Reopen task before editing"
                                  : "Edit Task"
                              }
                            >
                              <Icon icon="solar:pen-linear" />
                            </button>

                            <button
                              type="button"
                              title="Delete Task"
                              className="todo-action todo-action-delete"
                              disabled={deleteId === task.id || Boolean(toggleId)}
                              onClick={() => handleDeleteTask(task)}
                            >
                              {deleteId === task.id ? (
                                <span
                                  className="spinner-border spinner-border-sm"
                                  role="status"
                                />
                              ) : (
                                <Icon icon="solar:trash-bin-trash-linear" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mt-3">
            <div className="todo-muted">
              Showing {filteredTasks.length === 0 ? 0 : startIndex + 1} to{" "}
              {Math.min(startIndex + itemsPerPage, filteredTasks.length)} of{" "}
              {filteredTasks.length} tasks
            </div>

            <div className="d-flex gap-2 align-items-center flex-wrap">
              <button
                type="button"
                className="todo-page-button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
              >
                <Icon icon="solar:alt-arrow-left-linear" />
              </button>

              {paginationPages.map((page, index) => {
                const previous = paginationPages[index - 1];
                const showGap = previous && page - previous > 1;

                return (
                  <React.Fragment key={page}>
                    {showGap && <span className="todo-muted px-1">...</span>}
                    <button
                      type="button"
                      className={`todo-page-button ${
                        safePage === page ? "active" : ""
                      }`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                );
              })}

              <button
                type="button"
                className="todo-page-button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
              >
                <Icon icon="solar:alt-arrow-right-linear" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <TaskActionModal
        state={actionModal}
        saving={actionSaving}
        onClose={() => {
          if (!actionSaving) setActionModal(null);
        }}
        onConfirm={handleConfirmTaskAction}
      />

      <ViewTaskModal
        open={Boolean(viewingTask)}
        task={viewingTask}
        onClose={() => setViewingTask(null)}
      />

      <EditTaskModal
        open={Boolean(editingTask)}
        task={editingTask}
        saving={updating}
        onClose={() => {
          if (!updating) setEditingTask(null);
        }}
        onSave={handleUpdateTask}
      />
    </div>
  );
};

export default ToDoListLayer;