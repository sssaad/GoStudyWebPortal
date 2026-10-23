import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { getToken } from "../api/getToken";

const API_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=runStoredProcedure";

const FUTURE_BOOKING_COUNT_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=get_future_booking_count";

const CREATE_BLOCK_SUBSCRIPTION_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=add_dynamic_data";

const SEND_BLOCK_BOOKING_EMAIL_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=send_block_booking_email";

const headers = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
  "Content-Type": "application/json",
};

const YEAR_PRICING = {
  "Year 1": 250,
  "Year 2": 250,
  "Year 3": 250,
  "Year 4": 250,
  "Year 5": 250,
  "Year 6": 300,
  "Year 7": 350,
  "Year 8": 350,
  "Year 9": 400,
  "Year 10": 450,
  "Year 11": 500,
  "Year 12": 550,
  "Year 13": 550,
};

const FALLBACK_AVATAR = "https://gostudy.ae/assets/invalid-square.png";

const getAvatarSrc = (src) => {
  const s = String(src ?? "").trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") {
    return FALLBACK_AVATAR;
  }
  return s;
};

const normalizeYearLabel = (yearValue) => {
  const raw = String(yearValue ?? "").trim();
  if (!raw) return "";

  if (/^year\s*\d+$/i.test(raw)) {
    const num = raw.match(/\d+/)?.[0];
    return num ? `Year ${num}` : "";
  }

  if (/^\d+$/.test(raw)) {
    return `Year ${raw}`;
  }

  return YEAR_PRICING[raw] ? raw : "";
};

const normalizePaymentStatus = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (v === "unpaid") return "Unpaid";
  return "Paid";
};

const SearchableStudentSelect = ({
  value,
  onChange,
  options = [],
  placeholder = "Select Student",
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef(null);

  const selectedStudent = useMemo(() => {
    return options.find((item) => String(item.id) === String(value)) || null;
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;

    return options.filter((student) => {
      return (
        String(student.name || "").toLowerCase().includes(q) ||
        String(student.grade || "").toLowerCase().includes(q)
      );
    });
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  return (
    <div className="student-search-select" ref={wrapRef}>
      <button
        type="button"
        className="student-search-trigger"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
      >
        {selectedStudent ? (
          <div className="student-search-selected">
            <img
              src={getAvatarSrc(selectedStudent.imagepath)}
              alt={selectedStudent.name}
              className="student-search-avatar"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = FALLBACK_AVATAR;
              }}
            />
            <div className="student-search-meta">
              <span className="student-search-name">
                {selectedStudent.name}
              </span>
              <span className="student-search-grade">
                {selectedStudent.grade}
              </span>
            </div>
          </div>
        ) : (
          <span className="student-search-placeholder">{placeholder}</span>
        )}

        <span className={`student-search-arrow ${open ? "open" : ""}`}>
          ▾
        </span>
      </button>

      {open && !disabled ? (
        <div className="student-search-menu">
          <div className="student-search-input-wrap">
            <input
              type="text"
              className="student-search-input"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="student-search-list">
            {filteredOptions.length === 0 ? (
              <div className="student-search-empty">No student found</div>
            ) : (
              filteredOptions.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  className={`student-search-item ${String(student.id) === String(value) ? "active" : ""
                    }`}
                  onClick={() => {
                    onChange(student.id);
                    setOpen(false);
                  }}
                >
                  <img
                    src={getAvatarSrc(student.imagepath)}
                    alt={student.name}
                    className="student-search-avatar"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = FALLBACK_AVATAR;
                    }}
                  />
                  <div className="student-search-meta">
                    <span className="student-search-name">{student.name}</span>
                    <span className="student-search-grade">
                      {student.grade}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const CreateBlockSubscriptionModal = ({
  show,
  onClose,
  onSuccess,
  parentStudentId = "",
}) => {
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [checkingCredits, setCheckingCredits] = useState(false);
  const [blockSubscriptionInfo, setBlockSubscriptionInfo] = useState(null);

  const getInitialFormData = () => ({
    studentId: "",
    grade: "",
    packageLessons: "",
    paymentStatus: "Paid",
    customAmount5: "",
    customAmount10: "",
    useCustomAmount5: false,
    useCustomAmount10: false,
  });

  const [formData, setFormData] = useState(getInitialFormData);

  const gradeOptions = [
    "Year 1",
    "Year 2",
    "Year 3",
    "Year 4",
    "Year 5",
    "Year 6",
    "Year 7",
    "Year 8",
    "Year 9",
    "Year 10",
    "Year 11",
    "Year 12",
    "Year 13",
  ];

  const baseSessionPrice = useMemo(() => {
    return YEAR_PRICING[formData.grade] || 0;
  }, [formData.grade]);

  const packageOptions = useMemo(() => {
    const fiveGross = baseSessionPrice * 5;
    const fiveDiscount = (fiveGross * 5) / 100;
    const fiveNet = fiveGross - fiveDiscount;

    const tenGross = baseSessionPrice * 10;
    const tenDiscount = (tenGross * 15) / 100;
    const tenNet = tenGross - tenDiscount;

    return {
      5: {
        key: "5",
        label: "5 Lessons",
        lessons: 5,
        discountPercent: 5,
        priceWithoutDiscount: fiveGross,
        priceWithDiscount: fiveNet,
        discountAmount: fiveDiscount,
        validityText:
          "Pay now and get credits for 5 lessons to use within 60 days.",
      },
      10: {
        key: "10",
        label: "10 Lessons",
        lessons: 10,
        discountPercent: 15,
        priceWithoutDiscount: tenGross,
        priceWithDiscount: tenNet,
        discountAmount: tenDiscount,
        validityText:
          "Pay now and get credits for 10 lessons to use within 60 days.",
      },
    };
  }, [baseSessionPrice]);

  const selectedPackage = formData.packageLessons
    ? packageOptions[formData.packageLessons]
    : null;

  const normalizedStudents = useMemo(() => {
    if (!Array.isArray(students)) return [];

    return students.map((student, index) => {
      const id =
        student?.userid ||
        student?.id ||
        student?.userId ||
        student?.studentid ||
        student?.studentId ||
        `${index + 1}`;

      const firstName = String(student?.firstname || "").trim();
      const lastName = String(student?.lastname || "").trim();

      const name =
        student?.fullname ||
        student?.name ||
        student?.studentFullname ||
        student?.full_name ||
        `${firstName} ${lastName}`.trim() ||
        student?.username ||
        student?.email ||
        `Student ${index + 1}`;

      const grade = normalizeYearLabel(student?.year);

      return {
        ...student,
        id: String(id),
        name: String(name),
        grade,
        imagepath: String(student?.imagepath || "").trim(),
      };
    });
  }, [students]);

  const remainingCredits = Number(blockSubscriptionInfo?.credits || 0);
  const hasActiveCredits =
    Number(blockSubscriptionInfo?.isValidBlockRecord || 0) === 1 &&
    remainingCredits > 0;

  const formatAmount = (value) => {
    const num = Number(value || 0);
    return Number.isInteger(num) ? String(num) : String(num.toFixed(1));
  };

  const formatDisplayDate = (dateValue) => {
    if (!dateValue) return "";

    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return "";

    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getDaysRemaining = (expiryDate) => {
    if (!expiryDate) return 0;

    const today = getStartOfDay(new Date());
    const expiry = getStartOfDay(expiryDate);

    if (Number.isNaN(expiry.getTime())) return 0;

    const diffMs = expiry.getTime() - today.getTime();
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

    return days > 0 ? days : 0;
  };

  const buildCreditInfo = (row) => {
    const usedCredits = Number(row?.credits || 0);
    const totalPackageCreditsRaw = row?.package;
    const createdAtRaw = row?.createdAt;

    const totalPackageCredits = Number(totalPackageCreditsRaw || 0);

    const hasValidPackage =
      totalPackageCreditsRaw !== null &&
      totalPackageCreditsRaw !== undefined &&
      totalPackageCredits > 0;

    const hasValidCreatedAt =
      createdAtRaw !== null &&
      createdAtRaw !== undefined &&
      String(createdAtRaw).trim() !== "" &&
      !Number.isNaN(new Date(createdAtRaw).getTime());

    if (!hasValidPackage || !hasValidCreatedAt) {
      return {
        usedCredits,
        totalPackageCredits: 0,
        credits: 0,
        createdAt: "",
        expiryDate: null,
        daysRemaining: 0,
        formattedExpiry: "",
        isValidBlockRecord: 0,
        message: "",
      };
    }

    const createdAt = new Date(createdAtRaw);
    const remaining = Math.max(totalPackageCredits - usedCredits, 0);

    const expiryDate = new Date(createdAt);
    expiryDate.setDate(expiryDate.getDate() + 60);

    const daysRemaining = getDaysRemaining(expiryDate);
    const formattedExpiry = formatDisplayDate(expiryDate);

    return {
      usedCredits,
      totalPackageCredits,
      credits: remaining,
      createdAt: createdAtRaw,
      expiryDate,
      daysRemaining,
      formattedExpiry,
      isValidBlockRecord: 1,
      message:
        remaining > 0
          ? `This Student have ${remaining} valid credits! Use them to book lessons before they expire in ${daysRemaining} days${formattedExpiry ? ` (valid until ${formattedExpiry})` : ""
          }.`
          : "",
    };
  };

  const fetchStudents = async () => {
    try {
      setStudentsLoading(true);
      setStudentsError("");
      setStudents([]);

      const token = await getToken();
      if (!token) {
        setStudentsError("Token missing");
        return;
      }

      const payload = {
        procedureName: "GetAllStudents",
      };

      const res = await axios.post(API_URL, payload, {
        headers: { ...headers, token },
      });

      const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
      setStudents(rows);

      setFormData((prev) => ({
        ...prev,
        studentId: "",
        grade: "",
      }));
    } catch (err) {
      setStudents([]);
      setStudentsError(
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load students"
      );
    } finally {
      setStudentsLoading(false);
    }
  };

  const checkStudentFutureBookingCount = async (studentId) => {
    if (!studentId) {
      setBlockSubscriptionInfo(null);
      return;
    }

    try {
      setCheckingCredits(true);
      setBlockSubscriptionInfo(null);
      setSubmitError("");

      const token = await getToken();
      if (!token) {
        setSubmitError("Token missing");
        return;
      }

      const payload = {
        tablename: "bookteacher",
        conditions: [
          {
            studentid: Number(studentId),
            bookdate: "CURDATE()",
          },
        ],
        studentid: Number(studentId),
      };

      const res = await axios.post(FUTURE_BOOKING_COUNT_URL, payload, {
        headers: { ...headers, token },
      });

      const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
      const row = rows.length > 0 ? rows[0] : null;

      if (!row) {
        setBlockSubscriptionInfo(null);
        return;
      }

      const info = buildCreditInfo(row);

      if (
        Number(info?.isValidBlockRecord || 0) === 1 &&
        Number(info?.credits || 0) > 0
      ) {
        setBlockSubscriptionInfo(info);
      } else {
        setBlockSubscriptionInfo(null);
      }
    } catch (err) {
      setBlockSubscriptionInfo(null);
    } finally {
      setCheckingCredits(false);
    }
  };

  useEffect(() => {
    if (show) {
      setSubmitError("");
      setStudentsError("");
      setBlockSubscriptionInfo(null);
      setCheckingCredits(false);
      setFormData(getInitialFormData());
      fetchStudents();
    } else {
      setStudents([]);
      setStudentsLoading(false);
      setStudentsError("");
      setSubmitting(false);
      setSubmitError("");
      setBlockSubscriptionInfo(null);
      setCheckingCredits(false);
      setFormData(getInitialFormData());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, parentStudentId]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const setStudentAndAutoGrade = async (studentId) => {
    const selectedStudent =
      normalizedStudents.find((item) => String(item.id) === String(studentId)) ||
      null;

    setFormData((prev) => ({
      ...prev,
      studentId: String(studentId || ""),
      grade: selectedStudent?.grade || "",
      packageLessons: "",
      customAmount5: "",
      customAmount10: "",
      useCustomAmount5: false,
      useCustomAmount10: false,
    }));

    await checkStudentFutureBookingCount(studentId);
  };

  const handlePackageSelect = (packageKey) => {
    setFormData((prev) => ({
      ...prev,
      packageLessons: prev.packageLessons === packageKey ? "" : packageKey,
    }));
  };

  const handleToggleCustomAmount = (packageKey) => {
    setFormData((prev) => {
      if (packageKey === "5") {
        return {
          ...prev,
          useCustomAmount5: !prev.useCustomAmount5,
          customAmount5: !prev.useCustomAmount5 ? prev.customAmount5 : "",
        };
      }

      return {
        ...prev,
        useCustomAmount10: !prev.useCustomAmount10,
        customAmount10: !prev.useCustomAmount10 ? prev.customAmount10 : "",
      };
    });
  };

  const handleCustomAmountChange = (packageKey, value) => {
    const cleanedValue = value
      .replace(/[^\d.]/g, "")
      .replace(/(\..*?)\..*/g, "$1");

    if (packageKey === "5") {
      setFormData((prev) => ({
        ...prev,
        customAmount5: cleanedValue,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        customAmount10: cleanedValue,
      }));
    }
  };

  const getUseCustomAmount = (packageKey) => {
    return packageKey === "5"
      ? formData.useCustomAmount5
      : formData.useCustomAmount10;
  };

  const getCustomAmountValue = (packageKey) => {
    return packageKey === "5" ? formData.customAmount5 : formData.customAmount10;
  };

  const getFinalAmount = (pkg) => {
    const useCustomAmount = getUseCustomAmount(pkg.key);
    const customAmountValue = getCustomAmountValue(pkg.key);

    if (useCustomAmount && Number(customAmountValue || 0) > 0) {
      return Number(customAmountValue);
    }

    return Number(pkg.priceWithDiscount || 0);
  };

  const handlePayNow = async () => {
    if (!formData.studentId) {
      setSubmitError("Please select a student first.");
      return;
    }

    if (!formData.grade) {
      setSubmitError("Please select student year first.");
      return;
    }

    if (checkingCredits) {
      setSubmitError("Please wait, checking student credits...");
      return;
    }

    if (hasActiveCredits) {
      setSubmitError(
        blockSubscriptionInfo?.message ||
        "This student already has valid credits."
      );
      return;
    }

    if (!selectedPackage) {
      setSubmitError("Please select a package first.");
      return;
    }

    const paymentStatus = normalizePaymentStatus(formData.paymentStatus);

    if (!["Paid", "Unpaid"].includes(paymentStatus)) {
      setSubmitError("Please select a valid payment status.");
      return;
    }

    const useCustomAmount = getUseCustomAmount(selectedPackage.key);
    const customAmountValue = getCustomAmountValue(selectedPackage.key);

    if (useCustomAmount && Number(customAmountValue || 0) <= 0) {
      setSubmitError("Please enter a valid custom amount.");
      return;
    }

    const selectedStudent =
      normalizedStudents.find((item) => item.id === formData.studentId) || null;

    const finalAmount = getFinalAmount(selectedPackage);

    const confirmResult = await Swal.fire({
      icon: "warning",
      title: "Are you sure?",
      html: `
        <div style="text-align:center; line-height:1.7;">
          <div>
            Do you want to create <strong>${selectedPackage.lessons} lesson</strong> block booking for 
            <strong>${selectedStudent?.name || "this student"}</strong>?
          </div>
          <div style="margin-top:10px;">
            <strong>Amount:</strong> ${formatAmount(finalAmount)} AED<br/>
            <strong>Payment Status:</strong> ${paymentStatus}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Yes, create it",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (!confirmResult.isConfirmed) {
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError("");

      const token = await getToken();
      if (!token) {
        setSubmitError("Token missing");
        return;
      }

      const createdAt = new Date().toISOString();

      const createPayload = {
        tablename: "block_subscription",
        userId: Number(formData.studentId),
        createdAt,
        package: String(selectedPackage.lessons),
        price: Number(finalAmount),
        discount: 0,
        promocodeid: 0,
        payment_status: paymentStatus,
      };

      const createRes = await axios.post(
        CREATE_BLOCK_SUBSCRIPTION_URL,
        createPayload,
        {
          headers: { ...headers, token },
        }
      );

      const emailPayload = {
        lessons: String(selectedPackage.lessons),
        userid: Number(formData.studentId),
      };

      const emailRes = await axios.post(
        SEND_BLOCK_BOOKING_EMAIL_URL,
        emailPayload,
        {
          headers: { ...headers, token },
        }
      );

      if (onSuccess) {
        onSuccess({
          apiResponse: createRes?.data,
          emailApiResponse: emailRes?.data,
          formData: {
            ...formData,
            paymentStatus,
          },
          selectedStudent,
          selectedPackage,
          submittedPayload: createPayload,
          submittedEmailPayload: emailPayload,
        });
      }

      onClose();
    } catch (err) {
      setSubmitError(
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create block subscription"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderPackageDetail = (pkg) => {
    const isOpen = formData.packageLessons === pkg.key;
    const useCustomAmount = getUseCustomAmount(pkg.key);
    const customAmountValue = getCustomAmountValue(pkg.key);
    const finalAmount = getFinalAmount(pkg);

    return (
      <div key={pkg.key} className="block-package-group">
        <div
          className={`block-package-card ${isOpen ? "active" : ""} ${hasActiveCredits ? "disabled" : ""
            }`}
          onClick={() => {
            if (!hasActiveCredits && !checkingCredits) {
              handlePackageSelect(pkg.key);
            }
          }}
        >
          <div className="block-package-row">
            <div className="block-package-left">
              <span className="block-package-icon">{pkg.lessons}</span>
              <span>
                {pkg.label} &nbsp; - &nbsp; {formatAmount(finalAmount)} AED
              </span>
            </div>
            <span className={`block-package-arrow ${isOpen ? "open" : ""}`}>
              ›
            </span>
          </div>
        </div>

        <div className={`block-summary-outer ${isOpen ? "open" : ""}`}>
          <div className="block-summary-card">
            <div className="block-summary-text">{pkg.validityText}</div>

            <div className="block-summary-price">
              Price without discount: {formatAmount(pkg.priceWithoutDiscount)}{" "}
              AED
            </div>

            <div className="block-summary-price">
              Price with discount:{" "}
              {useCustomAmount
                ? `${formatAmount(finalAmount)} AED`
                : `${formatAmount(pkg.priceWithDiscount)} AED`}
            </div>

            <button
              type="button"
              className="block-add-custom-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCustomAmount(pkg.key);
              }}
              disabled={hasActiveCredits}
            >
              {useCustomAmount ? "Remove Custom Amount" : "+ Add Custom Amount"}
            </button>

            <div
              className={`block-custom-amount-wrap ${useCustomAmount ? "open" : ""
                }`}
            >
              <div className="block-inline-field">
                <label className="block-field-label block-field-label-small">
                  Custom Amount
                </label>
                <input
                  type="text"
                  className="block-custom-input"
                  placeholder="Enter custom amount"
                  value={customAmountValue}
                  onChange={(e) =>
                    handleCustomAmountChange(pkg.key, e.target.value)
                  }
                  disabled={hasActiveCredits}
                />
              </div>
            </div>

            <div className="block-pay-btn-wrap">
              <button
                type="button"
                className="block-pay-btn"
                onClick={handlePayNow}
                disabled={
                  submitting ||
                  studentsLoading ||
                  checkingCredits ||
                  !formData.studentId ||
                  !formData.grade ||
                  normalizedStudents.length === 0 ||
                  hasActiveCredits ||
                  (useCustomAmount && Number(customAmountValue || 0) <= 0)
                }
              >
                {checkingCredits
                  ? "Checking..."
                  : submitting
                    ? "Processing..."
                    : "Create Now"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!show) return null;

  return (
    <>
      <style>{`
        .block-subscription-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(7, 21, 43, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 9999;
        }

        .swal2-container {
          z-index: 20000 !important;
        }

        .block-subscription-modal {
          width: 100%;
          max-width: 640px;
          background: linear-gradient(180deg, #102a4d 0%, #0c2443 100%);
          border-radius: 22px;
          padding: 28px;
          color: #fff;
          position: relative;
          box-shadow: 0 18px 50px rgba(0,0,0,0.35);
          max-height: 92vh;
          overflow-y: auto;
        }

        .block-modal-close {
          position: absolute;
          right: 16px;
          top: 14px;
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 50%;
          background: rgba(255,255,255,0.14);
          color: #fff;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .block-modal-close:hover {
          background: rgba(255,255,255,0.2);
        }

        .block-modal-title {
          text-align: center;
          font-size: 22px;
          font-weight: 700;
          color: #2f96ff;
          margin-bottom: 8px;
        }

        .block-modal-subtitle {
          text-align: center;
          color: rgba(255,255,255,0.75);
          margin-bottom: 24px;
          font-size: 15px;
        }

        .block-field-card {
          background: rgba(46, 94, 152, 0.55);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 16px;
        }

        .block-field-label {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 12px;
          display: block;
          color: #dcecff;
        }

        .block-field-label-small {
          font-size: 14px;
          margin-bottom: 8px;
        }

        .block-select {
  width: 100%;
  background: #071a36;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 14px;
  color: #ffffff;
  padding: 13px 44px 13px 14px;
  outline: none;
  appearance: auto;
  -webkit-appearance: auto;
  box-shadow: inset 0 0 0 1px rgba(47, 150, 255, 0.08);
  font-size: 15px;
  font-weight: 600;
}

.block-select:focus {
  border-color: rgba(47, 150, 255, 0.85);
  box-shadow: 0 0 0 3px rgba(47, 150, 255, 0.16);
}

.block-select:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.block-select option {
  background: #071a36;
  color: #ffffff;
  font-size: 15px;
  font-weight: 500;
}

.block-select option:checked,
.block-select option:hover {
  background: #1f65c8;
  color: #ffffff;
}

        .block-message {
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          margin-bottom: 14px;
        }

        .block-message.error {
          background: rgba(255, 77, 79, 0.18);
          border: 1px solid rgba(255, 77, 79, 0.35);
          color: #ffd7d8;
        }

        .block-message.info {
          background: rgba(24, 144, 255, 0.18);
          border: 1px solid rgba(24, 144, 255, 0.35);
          color: #d9efff;
        }

        .block-message.credits {
          background: #eef3fb;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #2b4db9;
          padding: 16px 18px;
          border-radius: 14px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 16px;
        }

        .block-message-credits-icon {
          width: 22px;
          height: 22px;
          min-width: 22px;
          border-radius: 50%;
          background: rgba(43, 77, 185, 0.12);
          color: #2b4db9;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
          margin-top: 1px;
        }

        .student-search-select {
          position: relative;
          width: 100%;
        }

        .student-search-trigger {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.12);
          background: #071a36;
          border-radius: 16px;
          padding: 14px 16px;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
          min-height: 64px;
        }

        .student-search-selected {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .student-search-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(255,255,255,0.08);
          flex-shrink: 0;
          background: #16345b;
        }

        .student-search-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
          text-align: left;
        }

        .student-search-name {
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .student-search-grade {
          font-size: 12px;
          color: rgba(255,255,255,0.65);
          margin-top: 2px;
        }

        .student-search-placeholder {
          color: rgba(255,255,255,0.55);
          font-size: 15px;
          font-weight: 500;
          text-align: left;
        }

        .student-search-arrow {
          font-size: 18px;
          color: rgba(255,255,255,0.8);
          transition: transform 0.25s ease;
          flex-shrink: 0;
        }

        .student-search-arrow.open {
          transform: rotate(180deg);
        }

        .student-search-menu {
          position: absolute;
          top: calc(100% + 10px);
          left: 0;
          right: 0;
          background: #07162d;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 18px;
          box-shadow: 0 14px 34px rgba(0,0,0,0.35);
          z-index: 50;
          overflow: hidden;
        }

        .student-search-input-wrap {
          padding: 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .student-search-input {
          width: 100%;
          background: #061327;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 14px;
          padding: 13px 14px;
          color: #fff;
          outline: none;
          font-size: 15px;
        }

        .student-search-input::placeholder {
          color: rgba(255,255,255,0.45);
        }

        .student-search-list {
          max-height: 280px;
          overflow-y: auto;
          padding: 8px;
        }

        .student-search-item {
          width: 100%;
          border: 0;
          background: transparent;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 10px;
          border-radius: 14px;
          cursor: pointer;
          text-align: left;
        }

        .student-search-item:hover,
        .student-search-item.active {
          background: rgba(47, 150, 255, 0.14);
        }

        .student-search-empty {
          padding: 18px 14px;
          color: rgba(255,255,255,0.6);
          text-align: center;
        }

        .block-package-group {
          margin-bottom: 12px;
        }

        .block-package-card {
          background: #235086;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 18px;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .block-package-card:hover {
          transform: translateY(-1px);
        }

        .block-package-card.active {
          background: #2a5f9f;
          box-shadow: inset 0 0 0 1px rgba(85, 177, 255, 0.9);
        }

        .block-package-card.disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .block-package-card.disabled:hover {
          transform: none;
        }

        .block-package-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-weight: 700;
          color: #fff;
        }

        .block-package-left {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 18px;
        }

        .block-package-icon {
          width: 22px;
          height: 22px;
          border: 2px solid rgba(255,255,255,0.9);
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          flex-shrink: 0;
        }

        .block-package-arrow {
          font-size: 24px;
          color: rgba(255,255,255,0.8);
          line-height: 1;
          flex-shrink: 0;
          transition: transform 0.28s ease;
        }

        .block-package-arrow.open {
          transform: rotate(90deg);
        }

        .block-summary-outer {
          max-height: 0;
          opacity: 0;
          overflow: hidden;
          transition:
            max-height 0.35s ease,
            opacity 0.28s ease,
            margin-top 0.35s ease;
          margin-top: 0;
        }

        .block-summary-outer.open {
          max-height: 460px;
          opacity: 1;
          margin-top: 10px;
        }

        .block-summary-card {
          background: #0a1f3b;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 24px 20px;
          margin-left: 4px;
          margin-right: 4px;
          transform: translateY(-8px);
          transition: transform 0.35s ease;
        }

        .block-summary-outer.open .block-summary-card {
          transform: translateY(0);
        }

        .block-summary-text {
          color: rgba(255,255,255,0.78);
          margin-bottom: 22px;
          font-size: 14px;
        }

        .block-summary-price {
          font-size: 17px;
          font-weight: 700;
          color: #9fcbff;
          margin-bottom: 10px;
        }

        .block-add-custom-btn {
          border: 0;
          background: transparent;
          color: #7fc0ff;
          font-size: 14px;
          font-weight: 600;
          padding: 0;
          margin-top: 10px;
          cursor: pointer;
          text-decoration: underline;
        }

        .block-add-custom-btn:hover {
          color: #a8d6ff;
        }

        .block-add-custom-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .block-custom-amount-wrap {
          max-height: 0;
          opacity: 0;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .block-custom-amount-wrap.open {
          max-height: 120px;
          opacity: 1;
          margin-top: 14px;
        }

        .block-inline-field {
          margin-bottom: 6px;
        }

        .block-custom-input {
          width: 100%;
          background: #1d4679;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #fff;
          padding: 12px 14px;
          outline: none;
        }

        .block-custom-input::placeholder {
          color: rgba(255,255,255,0.5);
        }

        .block-custom-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .block-pay-btn-wrap {
          text-align: center;
          margin-top: 24px;
        }

        .block-pay-btn {
          border: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, #1890ff 0%, #2d7cff 100%);
          color: #fff;
          font-weight: 700;
          padding: 14px 28px;
          min-width: 210px;
          box-shadow: 0 10px 24px rgba(39, 131, 255, 0.35);
          cursor: pointer;
        }

        .block-pay-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        @media (max-width: 576px) {
          .block-subscription-modal {
            padding: 22px 16px;
          }

          .block-package-left {
            font-size: 16px;
          }

          .block-summary-price {
            font-size: 15px;
          }

          .block-pay-btn {
            width: 100%;
          }
        }
      `}</style>

      <div className="block-subscription-modal-overlay" onClick={onClose}>
        <div
          className="block-subscription-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="block-modal-close" onClick={onClose}>
            ×
          </button>

          <div className="block-modal-title">Block Booking</div>
          <div className="block-modal-subtitle">
            Book any subject, any tutor within 60 days.
          </div>

          {studentsError ? (
            <div className="block-message error">{studentsError}</div>
          ) : null}

          {submitError ? (
            <div className="block-message error">{submitError}</div>
          ) : null}

          <div className="block-field-card">
            <label className="block-field-label">Select Student</label>
            {studentsLoading ? (
              <div className="block-message info">Loading students...</div>
            ) : (
              <SearchableStudentSelect
                value={formData.studentId}
                options={normalizedStudents}
                onChange={setStudentAndAutoGrade}
                placeholder="Select Student"
                disabled={submitting}
              />
            )}
          </div>

          {checkingCredits ? (
            <div className="block-message info">Checking valid credits...</div>
          ) : null}

          {hasActiveCredits ? (
            <div className="block-message credits">
              <span className="block-message-credits-icon">✦</span>
              <div>{blockSubscriptionInfo?.message}</div>
            </div>
          ) : null}

          <div className="block-field-card">
            <label className="block-field-label">
              Choose Student&apos;s Year Group or Grade
            </label>

            <select
              className="block-select"
              value={formData.grade}
              onChange={(e) => handleChange("grade", e.target.value)}
              disabled={submitting}
            >
              <option value="">Select Year</option>
              {gradeOptions.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </div>

          <div className="block-field-card">
            <label className="block-field-label">Payment Status</label>

            <select
              className="block-select"
              value={formData.paymentStatus}
              onChange={(e) =>
                handleChange("paymentStatus", normalizePaymentStatus(e.target.value))
              }
              disabled={submitting || hasActiveCredits}
            >
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
            </select>
          </div>

          {renderPackageDetail(packageOptions[5])}
          {renderPackageDetail(packageOptions[10])}
        </div>
      </div>
    </>
  );
};

export default CreateBlockSubscriptionModal;