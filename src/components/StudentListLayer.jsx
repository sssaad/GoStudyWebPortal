import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import Swal from "sweetalert2";
import axios from "axios";

import { getAllStudents } from "../api/getAllStudents";
import { getNationalities } from "../api/getNationalities";
import { getToken } from "../api/getToken";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import moment from "moment";
import StudentDetailsModal from "../components/StudentDetailsModal";
import RegisterStudentModal from "../components/RegisterStudentModal";
import { hardDeleteUser } from "../api/hardDeleteUser";

const FALLBACK_AVATAR = "https://gostudy.ae/assets/invalid-square.png";

const PORTAL_RESET_PASSWORD_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=portal_reset_user_password";

const API_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "x-api-key": "abc123456789",
  userid: "test",
  password: "test",
  projectid: "1",
};

const EYE_ICON = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    xmlns="http://www.w3.org/2000/svg">
    <path d="M2.25 12C3.75 7.75 7.45 5 12 5C16.55 5 20.25 7.75 21.75 12C20.25 16.25 16.55 19 12 19C7.45 19 3.75 16.25 2.25 12Z"
      stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 15.25C13.7949 15.25 15.25 13.7949 15.25 12C15.25 10.2051 13.7949 8.75 12 8.75C10.2051 8.75 8.75 10.2051 8.75 12C8.75 13.7949 10.2051 15.25 12 15.25Z"
      stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const EYE_OFF_ICON = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    xmlns="http://www.w3.org/2000/svg">
    <path d="M3 3L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M10.6 5.14C11.06 5.05 11.53 5 12 5C16.55 5 20.25 7.75 21.75 12C21.27 13.36 20.56 14.56 19.67 15.55"
      stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.15 6.73C4.36 7.88 3 9.71 2.25 12C3.75 16.25 7.45 19 12 19C13.79 19 15.45 18.57 16.87 17.81"
      stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9.75 9.88C9.13 10.47 8.75 11.21 8.75 12C8.75 13.79 10.21 15.25 12 15.25C12.79 15.25 13.53 14.87 14.12 14.25"
      stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const isPortalDarkMode = () => {
  return (
    document.documentElement.getAttribute("data-bs-theme") === "dark" ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    document.body.getAttribute("data-theme") === "dark" ||
    document.documentElement.classList.contains("dark") ||
    document.body.classList.contains("dark") ||
    document.body.classList.contains("dark-theme") ||
    document.body.classList.contains("theme-dark")
  );
};

const getSwalTheme = () => {
  const dark = isPortalDarkMode();

  return {
    dark,
    background: dark ? "#1f2937" : "#ffffff",
    color: dark ? "#f8fafc" : "#111827",
    popupClass: dark
      ? "reset-pass-swal reset-pass-swal-dark"
      : "reset-pass-swal reset-pass-swal-light",
  };
};

const resolveToken = (tokenRes) => {
  if (typeof tokenRes === "string") return tokenRes;

  return (
    tokenRes?.token ||
    tokenRes?.access_token ||
    tokenRes?.accessToken ||
    tokenRes?.data?.token ||
    tokenRes?.data?.access_token ||
    tokenRes?.data?.accessToken ||
    tokenRes?.data?.data?.token ||
    tokenRes?.data?.data?.access_token ||
    tokenRes?.data?.data?.accessToken ||
    tokenRes?.data?.[0]?.token ||
    tokenRes?.data?.[0]?.access_token ||
    ""
  );
};

const StudentListLayer = () => {
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [seedRow, setSeedRow] = useState(null);

  const [showRegisterStudentModal, setShowRegisterStudentModal] = useState(false);

  const [compFilter, setCompFilter] = useState("all");

  const [nationalities, setNationalities] = useState([]);
  const [nationalityFilter, setNationalityFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  const studentsPerPage = 15;

  const getUD = (s) => s?.userdetails ?? {};

  const getUID = (s) => {
    const ud = getUD(s);
    return ud.userid ?? (s?.id ? Number(s.id) : null);
  };

  const getHardDeleteId = (s) => {
    const raw = s?.id ?? getUD(s)?.userid ?? null;
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  };

  const getRowKey = (s) =>
    String(
      s?.id ??
      getUD(s)?.userid ??
      `${s?.email ?? ""}-${s?.phonenumber ?? ""}-${s?.createddate ?? ""}`
    );

  const getFirstName = (s) => getUD(s).firstname ?? s.firstname ?? "";
  const getLastName = (s) => getUD(s).lastname ?? s.lastname ?? "";
  const getEmail = (s) => s.email ?? getUD(s).email ?? "";
  const getUsername = (s) => s?.username ?? getUD(s)?.username ?? "";

  const getStudentEmailOrUsername = (s) => {
    const u = String(getUsername(s) || "").trim();
    if (u) return u;

    const e = String(getEmail(s) || "").trim();
    return e || "-";
  };

  const getResetPasswordEmail = (s) => {
    const email = String(s?.email ?? getUD(s)?.email ?? "").trim();
    if (email) return email;

    const username = String(getUsername(s) || "").trim();
    return username;
  };

  const getAccountLabel = (s) => {
    const username = String(getUsername(s) || "").trim();
    const email = String(getEmail(s) || "").trim();

    if (username) return username;
    if (email) return email;
    return "-";
  };

  const getRawImage = (s) => {
    const raw = String(getUD(s)?.imagepath ?? s?.imagepath ?? "").trim();

    if (!raw) return "";
    if (raw === FALLBACK_AVATAR) return "";
    if (raw.includes("invalid-square.png")) return "";

    return raw;
  };

  const getParentEmail = (s) => getUD(s).parentemail ?? s.parentemail ?? "";
  const getPhone = (s) => (getUD(s).phonenumber ?? s.phonenumber ?? "") || "-";

  const getAddress = (s) => {
    const ud = getUD(s);
    const street = ud.street ?? s.street ?? "";
    const area = ud.area ?? s.area ?? "";
    const city = ud.city ?? s.city ?? "";
    const postcode = ud.postcode ?? s.postcode ?? "";

    return `${street ? street + ", " : ""}${area ? area + ", " : ""}${city ? city + " " : ""
      }${postcode}`
      .replace(/, ,/g, ",")
      .replace(/,\s*$/, "");
  };

  const getCountry = (s) => getUD(s).country ?? s.country ?? "-";
  const getCreated = (s) => s.createddate ?? getUD(s).createddate ?? "";

  const getImage = (s) => {
    const p = getRawImage(s);
    if (!p) return FALLBACK_AVATAR;
    return p;
  };

  const isIncomplete = (s) => !(getUD(s)?.id);

  const getNationalityId = (s) =>
    getUD(s)?.nationalityid ?? s?.nationalityid ?? null;

  const getNationalityName = (s) => {
    const ud = getUD(s);

    if (ud?.nationalityname) return String(ud.nationalityname);
    if (s?.nationalityname) return String(s.nationalityname);

    const nid = getNationalityId(s);
    if (nid === null || nid === undefined || nid === "") return "";

    const found = (nationalities || []).find((n) => String(n?.id) === String(nid));
    if (found?.nationality) return String(found.nationality);

    if (String(nid) === "0") return "Unknown";
    return `Nationality #${nid}`;
  };

  const getStudentYear = (s) => {
    const arr = Array.isArray(s?.educationdetails) ? s.educationdetails : [];
    const first = arr.find((e) => e && String(e.deleted ?? "0") !== "1") || arr[0];
    const raw = first?.degree ?? "";

    if (raw === null || raw === undefined) return null;

    const str = String(raw).trim();
    if (!str) return null;

    const m = str.match(/(\d{1,2})/);
    if (!m) return null;

    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    if (n < 1 || n > 13) return null;

    return n;
  };

  const fetchStudents = useCallback(async () => {
    try {
      const data = await getAllStudents();
      const list = data?.getallstudentlist ?? data ?? [];

      const filtered = (list || []).filter((student) => student.active !== "2");

      filtered.sort(
        (a, b) =>
          new Date(getCreated(b)).getTime() - new Date(getCreated(a)).getTime()
      );

      setStudents(filtered);
    } catch (e) {
      console.error("getAllStudents error:", e);
      setStudents([]);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getNationalities();
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : [];
        setNationalities(list || []);
      } catch (e) {
        console.error("getNationalities error:", e);
        setNationalities([]);
      }
    })();
  }, []);

  const nationalityOptions = useMemo(() => {
    const map = new Map();

    (nationalities || []).forEach((n) => {
      if (n?.id == null) return;
      map.set(String(n.id), String(n.nationality || `Nationality #${n.id}`));
    });

    (students || []).forEach((s) => {
      const id = getNationalityId(s);
      if (id === null || id === undefined || id === "") return;

      const key = String(id);
      if (map.has(key)) return;

      const label =
        getUD(s)?.nationalityname ||
        s?.nationalityname ||
        (String(id) === "0" ? "Unknown" : `Nationality #${id}`);
      map.set(key, String(label));
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [nationalities, students]);

  const handleResetPassword = async (student) => {
    const name =
      `${getFirstName(student)} ${getLastName(student)}`.trim() ||
      student.fullname ||
      "this student";

    const resetEmail = getResetPasswordEmail(student);
    const accountLabel = getAccountLabel(student);
    const profileImage = getRawImage(student);
    const theme = getSwalTheme();

    if (!resetEmail || resetEmail === "-") {
      Swal.fire({
        title: "Email Missing",
        text: "Student email is missing.",
        icon: "error",
        background: theme.background,
        color: theme.color,
        customClass: {
          popup: theme.popupClass,
          confirmButton: "btn btn-primary px-20 py-10 radius-8",
        },
        buttonsStyling: false,
      });
      return;
    }

    const imageHtml = profileImage
      ? `
        <img
          src="${escapeHtml(profileImage)}"
          alt="${escapeHtml(name)}"
          class="reset-pass-profile-img"
          onerror="this.style.display='none'"
        />
      `
      : "";

    const passwordPopup = await Swal.fire({
      title: "Add New Password",
      html: `
        <div class="reset-pass-inner">
          <div class="reset-pass-student-box ${profileImage ? "" : "no-image"}">
            ${imageHtml}

            <div class="reset-pass-student-info">
              <div class="reset-pass-student-name">${escapeHtml(name)}</div>
              <div class="reset-pass-student-account">${escapeHtml(accountLabel)}</div>
            </div>
          </div>

          <div class="reset-pass-field">
            <label>New Password</label>
            <div class="reset-pass-input-wrap">
              <input
                id="newStudentPassword"
                type="password"
                class="reset-pass-input"
                placeholder="Enter new password"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="reset-pass-eye"
                data-target="newStudentPassword"
                data-icon="newPasswordIcon"
                aria-label="Show password"
              >
                <span id="newPasswordIcon">${EYE_ICON}</span>
              </button>
            </div>
          </div>

          <div class="reset-pass-field">
            <label>Confirm Password</label>
            <div class="reset-pass-input-wrap">
              <input
                id="confirmStudentPassword"
                type="password"
                class="reset-pass-input"
                placeholder="Confirm new password"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="reset-pass-eye"
                data-target="confirmStudentPassword"
                data-icon="confirmPasswordIcon"
                aria-label="Show password"
              >
                <span id="confirmPasswordIcon">${EYE_ICON}</span>
              </button>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Cancel",
      focusConfirm: false,
      buttonsStyling: false,
      background: theme.background,
      color: theme.color,
      customClass: {
        popup: theme.popupClass,
        title: "reset-pass-title",
        htmlContainer: "reset-pass-html",
        confirmButton: "btn btn-primary px-20 py-10 radius-8",
        cancelButton: "btn btn-outline-secondary px-20 py-10 radius-8 ms-2",
      },
      didOpen: () => {
        const popup = Swal.getPopup();
        if (!popup) return;

        const toggleButtons = popup.querySelectorAll(".reset-pass-eye");

        toggleButtons.forEach((btn) => {
          btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");
            const iconId = btn.getAttribute("data-icon");

            const input = popup.querySelector(`#${targetId}`);
            const icon = popup.querySelector(`#${iconId}`);

            if (!input || !icon) return;

            const isPassword = input.getAttribute("type") === "password";
            input.setAttribute("type", isPassword ? "text" : "password");
            icon.innerHTML = isPassword ? EYE_OFF_ICON : EYE_ICON;
          });
        });
      },
      preConfirm: () => {
        const popup = Swal.getPopup();

        const newPassword = popup
          ?.querySelector("#newStudentPassword")
          ?.value?.trim();

        const confirmPassword = popup
          ?.querySelector("#confirmStudentPassword")
          ?.value?.trim();

        if (!newPassword) {
          Swal.showValidationMessage("Please enter new password.");
          return false;
        }

        if (
          newPassword.length < 8 ||
          !/[A-Z]/.test(newPassword) ||
          !/\d/.test(newPassword) ||
          !/[a-zA-Z]/.test(newPassword)
        ) {
          Swal.showValidationMessage(
            "Password must be at least 8 characters long and include an uppercase letter and a number."
          );
          return false;
        }

        if (!confirmPassword) {
          Swal.showValidationMessage("Please confirm password.");
          return false;
        }

        if (newPassword !== confirmPassword) {
          Swal.showValidationMessage("Password and confirm password do not match.");
          return false;
        }

        return { newPassword };
      },
    });

    if (!passwordPopup.isConfirmed) return;

    const newPassword = passwordPopup.value?.newPassword;
    const confirmTheme = getSwalTheme();

    const confirm = await Swal.fire({
      title: "Confirm Password Update",
      html: `
        <div class="reset-confirm-box">
          <div class="reset-confirm-name">${escapeHtml(name)}</div>
          <div class="reset-confirm-desc">Ready to update password?</div>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Update",
      cancelButtonText: "Cancel",
      buttonsStyling: false,
      background: confirmTheme.background,
      color: confirmTheme.color,
      customClass: {
        popup: confirmTheme.popupClass,
        title: "reset-pass-title",
        htmlContainer: "reset-pass-html",
        confirmButton: "btn btn-primary px-20 py-10 radius-8",
        cancelButton: "btn btn-outline-secondary px-20 py-10 radius-8 ms-2",
      },
    });

    if (!confirm.isConfirmed) return;

    try {
      const loadingTheme = getSwalTheme();

      Swal.fire({
        title: "Updating Password...",
        text: "Please wait while we update student password.",
        allowOutsideClick: false,
        showConfirmButton: false,
        background: loadingTheme.background,
        color: loadingTheme.color,
        customClass: {
          popup: loadingTheme.popupClass,
          title: "reset-pass-title",
        },
        didOpen: () => Swal.showLoading(),
      });

      const tokenRes = await getToken();
      const token = resolveToken(tokenRes);

      if (!token) {
        Swal.close();

        const errorTheme = getSwalTheme();
        Swal.fire({
          title: "Token Missing",
          text: "Token not found. Please try again.",
          icon: "error",
          background: errorTheme.background,
          color: errorTheme.color,
          customClass: {
            popup: errorTheme.popupClass,
            confirmButton: "btn btn-primary px-20 py-10 radius-8",
          },
          buttonsStyling: false,
        });
        return;
      }

      const payload = {
        token,
        target_user_id: getUID(student),
        newpassword: newPassword,
        admin_user_id: Number(localStorage.getItem("user_id")),
        session_version: localStorage.getItem("session_version"),
      };
      const res = await axios.post(PORTAL_RESET_PASSWORD_URL, payload, {
        headers: API_HEADERS,
      });

      const result = res?.data;

      if (Number(result?.statusCode) === 200) {
        await fetchStudents();

        const successTheme = getSwalTheme();

        Swal.fire({
          title: "Password Updated",
          html: `<div class="reset-success-text">${escapeHtml(
            name
          )}'s password has been updated successfully.</div>`,
          icon: "success",
          confirmButtonText: "Done",
          background: successTheme.background,
          color: successTheme.color,
          buttonsStyling: false,
          customClass: {
            popup: successTheme.popupClass,
            title: "reset-pass-title",
            htmlContainer: "reset-pass-html",
            confirmButton: "btn btn-primary px-20 py-10 radius-8",
          },
        });
      } else {
        const errorTheme = getSwalTheme();

        Swal.fire({
          title: "Update Failed",
          text: result?.message || "Password reset failed. Please try again.",
          icon: "error",
          background: errorTheme.background,
          color: errorTheme.color,
          customClass: {
            popup: errorTheme.popupClass,
            confirmButton: "btn btn-primary px-20 py-10 radius-8",
          },
          buttonsStyling: false,
        });
      }
    } catch (error) {
      console.error("set_password error:", error);

      const errorTheme = getSwalTheme();

      Swal.fire({
        title: "Update Failed",
        text:
          error?.response?.data?.message ||
          error?.message ||
          "Something went wrong while resetting password.",
        icon: "error",
        background: errorTheme.background,
        color: errorTheme.color,
        customClass: {
          popup: errorTheme.popupClass,
          confirmButton: "btn btn-primary px-20 py-10 radius-8",
        },
        buttonsStyling: false,
      });
    }
  };

  const handleHardDelete = async (student) => {
    const hardId = getHardDeleteId(student);

    const name =
      `${getFirstName(student)} ${getLastName(student)}`.trim() ||
      student.fullname ||
      "this student";

    if (!hardId) {
      console.log("Student object:", student);
      Swal.fire("Error", "Student ID missing.", "error");
      return;
    }

    const confirm = await Swal.fire({
      title: "Hard Delete Student?",
      text: `This will permanently delete ${name}. Continue?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Hard Delete",
    });

    if (!confirm.isConfirmed) return;

    Swal.fire({
      title: "Deleting...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const result = await hardDeleteUser(hardId);

    if (result?.statusCode === 200) {
      setStudents((prev) => prev.filter((s) => getHardDeleteId(s) !== hardId));
      Swal.fire("Deleted!", "Student hard deleted successfully.", "success");
    } else {
      Swal.fire("Error", result?.message || "Hard delete failed.", "error");
    }
  };

  const filteredStudents = students.filter((student) => {
    const incomplete = isIncomplete(student);
    if (compFilter === "complete" && incomplete) return false;
    if (compFilter === "incomplete" && !incomplete) return false;

    const fullName = `${getFirstName(student)} ${getLastName(student)}`
      .trim()
      .toLowerCase();

    const address = getAddress(student).toLowerCase();

    const yearVal = getStudentYear(student);
    const fullText =
      `${fullName} ${getEmail(student)} ${getUsername(student)} ${getParentEmail(student) || ""
        } ${address} ${getNationalityName(student)} ${yearVal ? `year ${yearVal}` : ""
        }`.toLowerCase();

    const matchesSearch = fullText.includes((searchTerm || "").toLowerCase());

    const cdate = new Date(getCreated(student));
    const afterStart = startDate ? cdate >= new Date(startDate) : true;
    const beforeEnd = endDate ? cdate <= new Date(endDate) : true;

    const matchesNationality =
      nationalityFilter === "" ||
      String(getNationalityId(student) ?? "") === String(nationalityFilter);

    const matchesYear =
      yearFilter === "" ||
      String(getStudentYear(student) ?? "") === String(yearFilter);

    return matchesSearch && afterStart && beforeEnd && matchesNationality && matchesYear;
  });

  const indexOfLastStudent = currentPage * studentsPerPage;
  const indexOfFirstStudent = indexOfLastStudent - studentsPerPage;
  const currentStudents = filteredStudents.slice(
    indexOfFirstStudent,
    indexOfLastStudent
  );
  const totalPages = Math.ceil(filteredStudents.length / studentsPerPage) || 1;

  const exportToExcel = () => {
    const heading = [["Student List"]];
    const data = filteredStudents.map((s, i) => ({
      "S.L": i + 1,
      "Join Date": getCreated(s)
        ? moment(getCreated(s)).format("DD MMM YYYY")
        : "-",
      Name: `${getFirstName(s)} ${getLastName(s)}`.trim() || s.fullname || "-",
      "Student Email/Username": getStudentEmailOrUsername(s),
      "Parent Email": getParentEmail(s) || "-",
      "Phone Number": getPhone(s),
      Address: getAddress(s) || "-",
      Country: getCountry(s) || "-",
      Status: isIncomplete(s) ? "Incomplete" : "Complete",
    }));

    const ws = XLSX.utils.json_to_sheet(data, { origin: -1 });
    XLSX.utils.sheet_add_aoa(ws, heading, { origin: "A1" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, `students_${moment().format("YYYY-MM-DD_HHmm")}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Student List", 14, 18);

    const head = [[
      "S.L",
      "Join Date",
      "Name",
      "Student Email/Username",
      "Parent Email",
      "Phone",
      "Address",
      "Country",
      "Status",
    ]];

    const body = filteredStudents.map((s, i) => ([
      i + 1,
      getCreated(s) ? moment(getCreated(s)).format("DD MMM YYYY") : "-",
      `${getFirstName(s)} ${getLastName(s)}`.trim() || s.fullname || "-",
      getStudentEmailOrUsername(s),
      getParentEmail(s) || "-",
      getPhone(s),
      getAddress(s) || "-",
      getCountry(s) || "-",
      isIncomplete(s) ? "Incomplete" : "Complete",
    ]));

    autoTable(doc, {
      startY: 24,
      head,
      body,
      styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [69, 179, 105] },
      columnStyles: {
        2: { cellWidth: 32 },
        3: { cellWidth: 38 },
        6: { cellWidth: 50 },
      },
    });

    doc.save(`students_${moment().format("YYYY-MM-DD_HHmm")}.pdf`);
  };

  const openStudent = (row) => {
    const incomplete = isIncomplete(row);
    const uid = getUID(row);

    if (incomplete) {
      const fullname =
        `${getFirstName(row)} ${getLastName(row)}`.trim() || row.fullname || "";
      setSeedRow({
        id: uid,
        email: getEmail(row) || "",
        parentemail: getParentEmail(row) || "",
        phonenumber: getPhone(row).replace("-", ""),
        fullname,
      });
      setSelectedStudentId(null);
    } else {
      setSelectedStudentId(uid);
      setSeedRow(null);
    }

    setShowStudentModal(true);
  };

  if (!students || students.length === 0) {
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{ height: "300px" }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            border: "6px solid #e0e0e0",
            borderTop: "6px solid #45B369",
            borderRadius: "50%",
            animation: "spin 1s ease-in-out infinite",
          }}
        />
        <style>{`@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div className="card h-100 p-0 radius-12">
      <style>{`
        .avatar-ring-danger {
          box-shadow: 0 0 0 2px #ffe3e6, 0 0 0 4px #dc3545;
        }

        .reset-pass-swal {
          width: min(520px, calc(100vw - 24px)) !important;
          border-radius: 18px !important;
          padding: 26px 28px !important;
          border: 1px solid rgba(148, 163, 184, 0.26) !important;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.25) !important;
        }

        .reset-pass-swal-light {
          background: #ffffff !important;
          color: #111827 !important;
        }

        .reset-pass-swal-dark {
          background: #1f2937 !important;
          color: #f8fafc !important;
          border-color: rgba(148, 163, 184, 0.25) !important;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.52) !important;
        }

        .reset-pass-swal-dark .swal2-title {
          color: #f8fafc !important;
        }

        .reset-pass-swal-dark .swal2-html-container {
          color: #cbd5e1 !important;
          opacity: 1 !important;
        }

        .reset-pass-swal-light .swal2-title {
          color: #111827 !important;
        }

        .reset-pass-swal-light .swal2-html-container {
          color: #475569 !important;
          opacity: 1 !important;
        }

        .reset-pass-title {
          font-size: 22px !important;
          font-weight: 800 !important;
          margin-bottom: 16px !important;
          color: inherit !important;
        }

        .reset-pass-html {
          margin: 0 !important;
          padding: 0 !important;
          color: inherit !important;
        }

        .reset-pass-inner {
          text-align: left;
        }

        .reset-pass-student-box {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border-radius: 14px;
          margin-bottom: 18px;
        }

        .reset-pass-student-box.no-image {
          padding-left: 16px;
        }

        .reset-pass-swal-light .reset-pass-student-box {
          background: #eefaf3;
          border: 1px solid rgba(69, 179, 105, 0.22);
        }

        .reset-pass-swal-dark .reset-pass-student-box {
          background: rgba(69, 179, 105, 0.14);
          border: 1px solid rgba(69, 179, 105, 0.32);
        }

        .reset-pass-profile-img {
          width: 46px;
          height: 46px;
          min-width: 46px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(69, 179, 105, 0.55);
          background: rgba(255, 255, 255, 0.08);
        }

        .reset-pass-student-info {
          min-width: 0;
          flex: 1;
        }

        .reset-pass-student-name {
          font-size: 15px;
          font-weight: 800;
          line-height: 1.25;
          word-break: break-word;
        }

        .reset-pass-swal-light .reset-pass-student-name {
          color: #111827 !important;
        }

        .reset-pass-swal-dark .reset-pass-student-name {
          color: #f8fafc !important;
        }

        .reset-pass-student-account {
          font-size: 12px;
          font-weight: 600;
          margin-top: 4px;
          line-height: 1.35;
          word-break: break-all;
        }

        .reset-pass-swal-light .reset-pass-student-account {
          color: #64748b !important;
        }

        .reset-pass-swal-dark .reset-pass-student-account {
          color: #cbd5e1 !important;
        }

        .reset-pass-field {
          margin-top: 14px;
        }

        .reset-pass-field label {
          display: block;
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 7px;
        }

        .reset-pass-swal-light .reset-pass-field label {
          color: #1f2937 !important;
        }

        .reset-pass-swal-dark .reset-pass-field label {
          color: #f1f5f9 !important;
        }

        .reset-pass-input-wrap {
          position: relative;
        }

        .reset-pass-input {
          width: 100%;
          height: 46px;
          border-radius: 10px;
          padding: 10px 48px 10px 13px;
          font-size: 14px;
          outline: none;
          transition: 0.18s ease;
        }

        .reset-pass-swal-light .reset-pass-input {
          background: #ffffff !important;
          color: #111827 !important;
          border: 1px solid #d9dee3 !important;
        }

        .reset-pass-swal-dark .reset-pass-input {
          background: #111827 !important;
          color: #f8fafc !important;
          border: 1px solid rgba(148, 163, 184, 0.34) !important;
        }

        .reset-pass-swal-light .reset-pass-input::placeholder {
          color: #9ca3af !important;
        }

        .reset-pass-swal-dark .reset-pass-input::placeholder {
          color: #94a3b8 !important;
        }

        .reset-pass-input:focus {
          border-color: #45B369 !important;
          box-shadow: 0 0 0 4px rgba(69, 179, 105, 0.16) !important;
        }

        .reset-pass-eye {
          position: absolute;
          top: 50%;
          right: 10px;
          transform: translateY(-50%);
          width: 34px;
          height: 34px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .reset-pass-swal-light .reset-pass-eye {
          color: #64748b !important;
        }

        .reset-pass-swal-dark .reset-pass-eye {
          color: #cbd5e1 !important;
        }

        .reset-pass-eye:hover {
          background: rgba(100, 116, 139, 0.14);
          color: #45B369 !important;
        }

        .reset-confirm-box {
          text-align: center;
          padding: 2px 4px 8px;
        }

        .reset-confirm-name {
          font-size: 16px;
          font-weight: 800;
          margin-bottom: 6px;
        }

        .reset-pass-swal-light .reset-confirm-name {
          color: #111827 !important;
        }

        .reset-pass-swal-dark .reset-confirm-name {
          color: #f8fafc !important;
        }

        .reset-confirm-desc {
          font-size: 13px;
          font-weight: 600;
        }

        .reset-pass-swal-light .reset-confirm-desc {
          color: #64748b !important;
        }

        .reset-pass-swal-dark .reset-confirm-desc {
          color: #cbd5e1 !important;
        }

        .reset-success-text {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.6;
        }

        .reset-pass-swal-light .reset-success-text {
          color: #475569 !important;
        }

        .reset-pass-swal-dark .reset-success-text {
          color: #cbd5e1 !important;
        }

        .reset-pass-swal-dark .swal2-success-ring {
          border-color: rgba(69, 179, 105, 0.45) !important;
        }

        .reset-pass-swal-dark .swal2-success-line-tip,
        .reset-pass-swal-dark .swal2-success-line-long {
          background-color: #86efac !important;
        }

        .reset-pass-swal .swal2-icon-content {
          font-weight: 800 !important;
        }

        .reset-pass-swal .swal2-actions {
          margin-top: 22px !important;
        }

        .reset-pass-swal .btn-outline-secondary {
          border-color: rgba(148, 163, 184, 0.5) !important;
        }

        .reset-pass-swal-dark .btn-outline-secondary {
          color: #e5e7eb !important;
          border-color: rgba(203, 213, 225, 0.38) !important;
          background: transparent !important;
        }

        .reset-pass-swal-dark .btn-outline-secondary:hover {
          background: rgba(148, 163, 184, 0.12) !important;
        }

        .swal2-validation-message {
          border-radius: 10px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          margin-top: 14px !important;
        }

        .reset-pass-swal-dark .swal2-validation-message {
          background: rgba(127, 29, 29, 0.24) !important;
          color: #fecaca !important;
        }

        .reset-pass-swal-light .swal2-validation-message {
          background: #fff1f2 !important;
          color: #be123c !important;
        }
      `}</style>

      <div className="card-header border-bottom bg-base py-16 px-24 d-flex align-items-center flex-wrap gap-3 justify-content-between">
        <div className="d-flex align-items-center flex-wrap gap-3">
          <input
            type="text"
            className="form-control w-auto"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />

          <input
            type="date"
            className="form-control w-auto"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setCurrentPage(1);
            }}
          />

          <input
            type="date"
            className="form-control w-auto"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setCurrentPage(1);
            }}
          />

          <select
            className="form-select w-auto"
            value={compFilter}
            onChange={(e) => {
              setCompFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">Profile: All</option>
            <option value="complete">Completed Profiles</option>
            <option value="incomplete">Incomplete Profiles</option>
          </select>

          <select
            className="form-select w-auto"
            value={nationalityFilter}
            onChange={(e) => {
              setNationalityFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Nationality: All</option>
            {nationalityOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>

          <select
            className="form-select w-auto"
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Year: All</option>
            {Array.from({ length: 13 }).map((_, i) => {
              const v = String(i + 1);
              return (
                <option key={v} value={v}>
                  Year {v}
                </option>
              );
            })}
          </select>

          <button
            onClick={() => {
              setSearchTerm("");
              setStartDate("");
              setEndDate("");
              setCompFilter("all");
              setNationalityFilter("");
              setYearFilter("");
              setCurrentPage(1);
            }}
            className="btn btn-outline-secondary btn-sm"
          >
            Reset
          </button>

          <button onClick={exportToExcel} className="btn btn-success btn-sm">
            Excel Export
          </button>

          <button onClick={exportToPDF} className="btn btn-danger btn-sm">
            PDF Export
          </button>

          <button
            onClick={() => setShowRegisterStudentModal(true)}
            className="btn btn-primary btn-sm d-flex align-items-center gap-1"
          >
            <Icon icon="ic:round-person-add" />
            Register Student
          </button>
        </div>
      </div>

      <div className="card-body p-24">
        <div
          className="table-responsive"
          style={{ maxHeight: "calc(100vh - 360px)" }}
        >
          <table
            className="table bordered-table sm-table mb-0"
            style={{ borderCollapse: "separate" }}
          >
            <thead>
              <tr
                style={{
                  position: "sticky",
                  top: 0,
                  background: "#f8f9fa",
                  zIndex: 5,
                }}
              >
                <th>S.L</th>
                <th>Join Date</th>
                <th>Student Name</th>
                <th>Student Email/Username</th>
                <th>Parent Email</th>
                <th>Parent Phone Number</th>
                <th>Address</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>

            <tbody>
              {currentStudents.map((s, idx) => {
                const incomplete = isIncomplete(s);
                const name =
                  `${getFirstName(s)} ${getLastName(s)}`.trim() || s.fullname || "-";
                const img = getImage(s);
                const created = getCreated(s);

                return (
                  <tr key={getRowKey(s)}>
                    <td>{indexOfFirstStudent + idx + 1}</td>
                    <td>{created ? moment(created).format("DD MMM YYYY") : "-"}</td>

                    <td>
                      <div className="d-flex align-items-center">
                        <img
                          src={img}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = FALLBACK_AVATAR;
                          }}
                          alt="User"
                          className={`w-40-px h-40-px rounded-circle me-12 ${incomplete ? "avatar-ring-danger" : ""
                            }`}
                          style={{ objectFit: "cover" }}
                        />
                        <span>{name}</span>
                      </div>
                    </td>

                    <td>{getStudentEmailOrUsername(s)}</td>
                    <td>{getParentEmail(s) || "-"}</td>
                    <td>{getPhone(s)}</td>
                    <td>{getAddress(s) || "-"}</td>

                    <td className="text-center">
                      <div className="d-flex justify-content-center gap-2">
                        <button
                          className={`btn btn-sm ${incomplete ? "btn-outline-danger" : "btn-primary"
                            }`}
                          onClick={() => openStudent(s)}
                          title={incomplete ? "Add Details" : "View / Edit"}
                        >
                          <Icon icon="majesticons:eye-line" />
                        </button>

                        <button
                          className="btn btn-warning btn-sm"
                          onClick={() => handleResetPassword(s)}
                          title="Reset Password"
                        >
                          <Icon icon="mdi:lock-reset" />
                        </button>

                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleHardDelete(s)}
                          title="Hard Delete"
                        >
                          <Icon icon="fluent:delete-24-regular" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="d-flex justify-content-between mt-3">
          <span>
            Showing {filteredStudents.length === 0 ? 0 : indexOfFirstStudent + 1} to{" "}
            {Math.min(indexOfLastStudent, filteredStudents.length)} of{" "}
            {filteredStudents.length} entries
          </span>
          <ul className="pagination">
            {Array.from({ length: totalPages }).map((_, i) => (
              <li
                key={i}
                className={`page-item ${currentPage === i + 1 ? "active" : ""}`}
              >
                <button onClick={() => setCurrentPage(i + 1)} className="page-link">
                  {i + 1}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {showStudentModal && (
        <StudentDetailsModal
          show={showStudentModal}
          onClose={() => {
            setShowStudentModal(false);
            setSelectedStudentId(null);
            setSeedRow(null);
          }}
          userid={selectedStudentId}
          seed={seedRow}
          onSave={() => { }}
        />
      )}

      {showRegisterStudentModal && (
        <RegisterStudentModal
          show={showRegisterStudentModal}
          onClose={() => setShowRegisterStudentModal(false)}
          onSave={async () => {
            setShowRegisterStudentModal(false);
            setCurrentPage(1);
            await fetchStudents();
          }}
        />
      )}
    </div>
  );
};

export default StudentListLayer;