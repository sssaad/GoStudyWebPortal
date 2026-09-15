import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import moment from "moment";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getToken } from "../api/getToken";
import { getDashboardCounts } from "../api/getDashboardCounts";

const GET_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=get_lookup_data";

const RUN_SP_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=runStoredProcedure";

const SAVE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=save_teacher_payout";

const headers = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
  "Content-Type": "application/json",
};

const TeacherPayoutListPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalProfitApi, setTotalProfitApi] = useState(0);
  const [totalTutorPayout, setTotalTutorPayout] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [paidFilter, setPaidFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 10;

  const tokenRef = useRef("");
  const isMountedRef = useRef(true);
  const fetchAbortRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }
    };
  }, []);

  const ensureToken = async () => {
    if (tokenRef.current) {
      return tokenRef.current;
    }

    try {
      const token = await getToken();

      tokenRef.current = token || "";

      return tokenRef.current;
    } catch (error) {
      tokenRef.current = "";

      return "";
    }
  };

  const clearTokenIfLooksInvalid = (message) => {
    const normalizedMessage = String(
      message || "",
    ).toLowerCase();

    if (
      normalizedMessage.includes("token") ||
      normalizedMessage.includes("unauthorized") ||
      normalizedMessage.includes("invalid") ||
      normalizedMessage.includes("expired")
    ) {
      tokenRef.current = "";
    }
  };

  const safeId = (value) =>
    String(value ?? "").trim();

  const makeFallbackKey = () =>
    `row_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;

  const parseSqlLikeDateTime = (value) => {
    if (!value) {
      return null;
    }

    const stringValue = String(value).trim();

    if (!stringValue) {
      return null;
    }

    const normalizedValue =
      stringValue.includes(" ")
        ? stringValue.replace(" ", "T")
        : stringValue;

    const parsedDate = new Date(normalizedValue);

    return Number.isNaN(parsedDate.getTime())
      ? null
      : parsedDate;
  };

  const ymdLocalStart = (value) => {
    if (!value) {
      return null;
    }

    const parsedDate = new Date(
      `${value}T00:00:00`,
    );

    return Number.isNaN(parsedDate.getTime())
      ? null
      : parsedDate;
  };

  const ymdLocalEnd = (value) => {
    if (!value) {
      return null;
    }

    const parsedDate = new Date(
      `${value}T23:59:59.999`,
    );

    return Number.isNaN(parsedDate.getTime())
      ? null
      : parsedDate;
  };

  const fmtDate = (value) => {
    if (!value) {
      return "—";
    }

    const parsedDate =
      parseSqlLikeDateTime(value);

    if (!parsedDate) {
      return "—";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(parsedDate);
  };

  const fmtTime = (value) => {
    if (!value) {
      return "—";
    }

    const stringValue = String(value).trim();

    if (!stringValue) {
      return "—";
    }

    const parsedTime = moment(
      stringValue,
      [
        "HH:mm:ss",
        "HH:mm",
        "h:mm A",
        "hh:mm A",
      ],
      true,
    );

    if (parsedTime.isValid()) {
      return parsedTime.format("hh:mm A");
    }

    if (stringValue.length >= 5) {
      return stringValue.slice(0, 5);
    }

    return stringValue;
  };

  const parseAmount = (value) => {
    const amount = Number(
      String(value ?? "")
        .replace(/,/g, "")
        .trim(),
    );

    return Number.isFinite(amount)
      ? amount
      : 0;
  };

  const money = (amount) =>
    `AED ${Number(amount || 0).toFixed(2)}`;

  const toYMD = (value) => {
    if (!value) {
      return "";
    }

    const stringValue = String(value).trim();

    if (!stringValue) {
      return "";
    }

    if (stringValue.includes(" ")) {
      return stringValue.split(" ")[0];
    }

    if (
      /^\d{4}-\d{2}-\d{2}$/.test(
        stringValue,
      )
    ) {
      return stringValue;
    }

    const parsedDate = new Date(stringValue);

    if (Number.isNaN(parsedDate.getTime())) {
      return "";
    }

    return parsedDate
      .toISOString()
      .slice(0, 10);
  };

  const todayYMD = () =>
    new Date().toISOString().slice(0, 10);

  const getPaidStatus = (row) =>
    String(row?.paid_status).toLowerCase() ===
      "paid"
      ? "Paid"
      : "Unpaid";

  const badgeClassByStatus = (status) =>
    String(status).toLowerCase() === "paid"
      ? "bg-success"
      : "bg-secondary";

  const toAmountString2dpOrNull = (
    value,
  ) => {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    const stringValue = String(value).trim();

    if (!stringValue) {
      return null;
    }

    const amount = parseAmount(stringValue);

    return Number.isFinite(amount)
      ? amount.toFixed(2)
      : null;
  };

  const formatExportStatus = (value) =>
    String(value || "").toLowerCase() ===
      "paid"
      ? "Paid"
      : "Unpaid";

  const fetchTotalRevenue = async () => {
    try {
      const response =
        await getDashboardCounts();

      const counts =
        response?.get_dashboardcounts ||
        response;

      const revenue = parseAmount(
        counts?.totalpayments,
      );

      const profit = parseAmount(
        counts?.totalprofit ??
        counts?.total_profit ??
        counts?.profit ??
        counts?.totalProfit ??
        0,
      );

      const tutorPayout = parseAmount(
        counts?.total_tutor_payout_aed,
      );

      if (!isMountedRef.current) {
        return;
      }

      setTotalRevenue(revenue);
      setTotalProfitApi(profit);
      setTotalTutorPayout(tutorPayout);
    } catch (error) {
      console.error(
        "Total revenue/profit/payout fetch error:",
        error,
      );

      if (!isMountedRef.current) {
        return;
      }

      setTotalRevenue(0);
      setTotalProfitApi(0);
      setTotalTutorPayout(0);
    }
  };

  const fetchTeacherPayouts = async () => {
    try {
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }

      const controller =
        new AbortController();

      fetchAbortRef.current = controller;

      setLoading(true);
      setError("");

      const token = await ensureToken();

      if (!token) {
        if (!isMountedRef.current) {
          return;
        }

        setRows([]);
        setError("Token missing");

        return;
      }

      const lookupBody = {
        token,
        tablename: "teacher_payouts",
      };

      const groupMapBody = {
        procedureName:
          "get_teacher_payout_group_map",
        parameters: [],
      };

      const [
        lookupResponse,
        groupMapResponse,
      ] = await Promise.all([
        axios.post(
          GET_URL,
          lookupBody,
          {
            headers,
            signal: controller.signal,
          },
        ),

        axios.post(
          RUN_SP_URL,
          groupMapBody,
          {
            headers: {
              ...headers,
              token,
            },
            signal: controller.signal,
          },
        ),
      ]);

      const lookupData = Array.isArray(
        lookupResponse?.data?.data,
      )
        ? lookupResponse.data.data
        : [];

      const groupMapData = Array.isArray(
        groupMapResponse?.data?.data,
      )
        ? groupMapResponse.data.data
        : [];

      const splitIds = (value) =>
        String(value || "")
          .split(",")
          .map((id) => safeId(id))
          .filter(Boolean);

      const lookupByBookingId = new Map(
        lookupData.map((item) => [
          safeId(item?.booking_id),
          item,
        ]),
      );

      const allGroupBookingIds =
        new Set();

      groupMapData.forEach((group) => {
        splitIds(
          group?.all_group_booking_ids,
        ).forEach((bookingId) => {
          allGroupBookingIds.add(
            bookingId,
          );
        });
      });

      /*
       * Existing direct/one-to-one rows
       * remain unchanged.
       */
      const directRows = lookupData.filter(
        (item) =>
          !allGroupBookingIds.has(
            safeId(item?.booking_id),
          ),
      );

      /*
       * One frontend row per
       * group_live_session_id.
       */
      const groupRows = groupMapData
        .map((group) => {
          const canonicalBookingId =
            safeId(
              group?.canonical_booking_id,
            );

          const mainBookingIds = splitIds(
            group?.main_booking_ids,
          );

          const baseRow =
            lookupByBookingId.get(
              canonicalBookingId,
            ) ||
            mainBookingIds
              .map((bookingId) =>
                lookupByBookingId.get(
                  bookingId,
                ),
              )
              .find(Boolean);

          if (
            !baseRow ||
            !safeId(
              group
                ?.canonical_teacher_payout_id,
            )
          ) {
            return null;
          }

          return {
            ...baseRow,

            teacher_payout_id: safeId(
              group
                .canonical_teacher_payout_id,
            ),

            booking_id:
              canonicalBookingId ||
              safeId(baseRow?.booking_id),

            booking_display_id:
              `Group #${safeId(
                group
                  ?.group_live_session_id,
              )}`,

            teacher_name:
              group?.teacher_name ||
              baseRow?.teacher_name ||
              "—",

            student_name:
              group?.student_names ||
              baseRow?.student_name ||
              "—",

            subject_name:
              group?.subject_name ||
              baseRow?.subject_name ||
              "—",

            session_date:
              baseRow?.session_date ||
              group?.session_date ||
              "",

            start_time:
              baseRow?.start_time ||
              group?.slot_start ||
              "",

            end_time:
              baseRow?.end_time ||
              group?.slot_end ||
              "",

            session_fee_aed:
              group
                ?.group_session_fee_aed ??
              baseRow?.session_fee_aed ??
              "0",

            is_group_booking: 1,

            group_live_session_id:
              safeId(
                group
                  ?.group_live_session_id,
              ),

            group_batch_id: safeId(
              group?.group_batch_id,
            ),

            student_count: Number(
              group?.student_count || 0,
            ),

            all_group_booking_ids:
              splitIds(
                group
                  ?.all_group_booking_ids,
              ),

            main_booking_ids:
              mainBookingIds,
          };
        })
        .filter(Boolean);

      const combinedData = [
        ...directRows,
        ...groupRows,
      ];

      const mappedRows =
        combinedData.map((item) => {
          const teacherPayoutId =
            safeId(
              item?.teacher_payout_id,
            );

          const bookingId = safeId(
            item?.booking_id,
          );

          const isGroupBooking =
            Number(
              item?.is_group_booking || 0,
            ) === 1;

          const rowKey = isGroupBooking
            ? `group_${safeId(
              item
                ?.group_live_session_id,
            )}`
            : teacherPayoutId ||
            bookingId ||
            makeFallbackKey();

          const isTutorPaid =
            String(
              item?.is_tutor_paid ?? "0",
            ) === "1";

          return {
            _key: rowKey,

            teacher_payout_id:
              teacherPayoutId,

            booking_id: bookingId,

            booking_display_id:
              item?.booking_display_id ||
              bookingId,

            teacher_name:
              item?.teacher_name ?? "—",

            student_name:
              item?.student_name ?? "—",

            subject_name:
              item?.subject_name ?? "—",

            booking_date:
              item?.session_date ?? "",

            slot_start:
              item?.start_time ?? "",

            slot_end:
              item?.end_time ?? "",

            session_fee_aed:
              item?.session_fee_aed ??
              "0",

            payment_amount_aed:
              item?.tutor_payout_aed !==
                null &&
                item?.tutor_payout_aed !==
                undefined &&
                String(
                  item?.tutor_payout_aed,
                ).trim() !== ""
                ? String(
                  item
                    ?.tutor_payout_aed,
                )
                : "",

            paid_status: isTutorPaid
              ? "Paid"
              : "Unpaid",

            paid_on:
              toYMD(
                item?.tutor_paid_on,
              ) || "",

            payout_method:
              item?.payout_method
                ? String(
                  item.payout_method,
                )
                : "",

            is_group_booking:
              isGroupBooking ? 1 : 0,

            group_live_session_id:
              safeId(
                item
                  ?.group_live_session_id,
              ),

            group_batch_id: safeId(
              item?.group_batch_id,
            ),

            student_count: Number(
              item?.student_count || 0,
            ),

            all_group_booking_ids:
              Array.isArray(
                item
                  ?.all_group_booking_ids,
              )
                ? item
                  .all_group_booking_ids
                : [],

            main_booking_ids:
              Array.isArray(
                item?.main_booking_ids,
              )
                ? item.main_booking_ids
                : [],

            _dirty: false,
            _saving: false,
            _rowError: "",
          };
        });

      if (!isMountedRef.current) {
        return;
      }

      setRows(mappedRows);
      setCurrentPage(1);
    } catch (error) {
      if (
        error?.name ===
        "CanceledError" ||
        error?.code === "ERR_CANCELED"
      ) {
        return;
      }

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Internal API error";

      clearTokenIfLooksInvalid(message);

      if (!isMountedRef.current) {
        return;
      }

      setRows([]);
      setError(message);
    } finally {
      if (!isMountedRef.current) {
        return;
      }

      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeacherPayouts();
    fetchTotalRevenue();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markDirty = (row) => ({
    ...row,
    _dirty: true,
    _rowError: "",
  });

  const updatePaymentAmount = (
    rowKey,
    value,
  ) => {
    setRows((previousRows) =>
      previousRows.map((row) =>
        row._key === rowKey
          ? markDirty({
            ...row,
            payment_amount_aed:
              value,
          })
          : row,
      ),
    );
  };

  const updatePaidStatus = (
    rowKey,
    status,
  ) => {
    setRows((previousRows) =>
      previousRows.map((row) => {
        if (row._key !== rowKey) {
          return row;
        }

        if (status === "Paid") {
          return markDirty({
            ...row,
            paid_status: "Paid",

            paid_on:
              row.paid_on ||
              todayYMD(),
          });
        }

        return markDirty({
          ...row,
          paid_status: "Unpaid",
          paid_on: "",
        });
      }),
    );
  };

  const updatePaidOn = (
    rowKey,
    value,
  ) => {
    setRows((previousRows) =>
      previousRows.map((row) =>
        row._key === rowKey
          ? markDirty({
            ...row,
            paid_on: value,
          })
          : row,
      ),
    );
  };

  const updateMethod = (
    rowKey,
    value,
  ) => {
    setRows((previousRows) =>
      previousRows.map((row) =>
        row._key === rowKey
          ? markDirty({
            ...row,
            payout_method: value,
          })
          : row,
      ),
    );
  };

  const setRowError = (
    rowKey,
    message,
  ) => {
    setRows((previousRows) =>
      previousRows.map((row) =>
        row._key === rowKey
          ? {
            ...row,
            _rowError: message,
          }
          : row,
      ),
    );
  };

  const saveRow = async (row) => {
    const isPaid =
      getPaidStatus(row) === "Paid";

    const hasTeacherPayoutId =
      Boolean(
        safeId(
          row?.teacher_payout_id,
        ),
      );

    const hasBookingId = Boolean(
      safeId(row?.booking_id),
    );

    if (
      !hasTeacherPayoutId &&
      !hasBookingId
    ) {
      const message =
        "No unique id found (teacher_payout_id / booking_id). Cannot update.";

      setRowError(row._key, message);

      Swal.fire({
        icon: "error",
        title: "Save Failed",
        text: message,
      });

      return;
    }

    if (
      !hasTeacherPayoutId &&
      hasBookingId
    ) {
      Swal.fire({
        icon: "warning",
        title: "Warning",
        text: "teacher_payout_id missing. Saving with booking_id only.",
        timer: 2200,
        showConfirmButton: false,
      });
    }

    if (isPaid && !row.paid_on) {
      const message =
        "Paid on date is required when status is Paid.";

      setRowError(row._key, message);

      Swal.fire({
        icon: "warning",
        title: "Missing Paid Date",
        text: message,
      });

      return;
    }

    const controller =
      new AbortController();

    try {
      setRows((previousRows) =>
        previousRows.map(
          (currentRow) =>
            currentRow._key ===
              row._key
              ? {
                ...currentRow,
                _saving: true,
                _rowError: "",
              }
              : currentRow,
        ),
      );

      const token = await ensureToken();

      if (!token) {
        throw new Error(
          "Token missing",
        );
      }

      const payload = {
        token,

        teacher_payout_id: safeId(
          row.teacher_payout_id,
        ),

        booking_id: safeId(
          row.booking_id,
        ),

        group_live_session_id:
          row.is_group_booking
            ? safeId(
              row
                .group_live_session_id,
            )
            : null,

        tutor_payout_aed:
          toAmountString2dpOrNull(
            row.payment_amount_aed,
          ) || "0.00",

        is_tutor_paid: isPaid ? 1 : 0,

        tutor_paid_on: isPaid
          ? row.paid_on
          : null,

        payout_method:
          row.payout_method
            ? String(
              row.payout_method,
            )
            : null,
      };

      const response = await axios.post(
        SAVE_URL,
        payload,
        {
          headers,
          signal: controller.signal,
        },
      );

      const successful =
        response?.data?.statusCode ===
        200 ||
        String(
          response?.data?.message ||
          "",
        )
          .toLowerCase()
          .includes("successful");

      if (!successful) {
        throw new Error(
          response?.data?.message ||
          "Save failed",
        );
      }

      if (!isMountedRef.current) {
        return;
      }

      await fetchTeacherPayouts();
      await fetchTotalRevenue();

      Swal.fire({
        icon: "success",
        title: "Saved",
        text: "Record updated successfully ✅",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (error) {
      if (
        error?.name ===
        "CanceledError" ||
        error?.code === "ERR_CANCELED"
      ) {
        return;
      }

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Save failed";

      clearTokenIfLooksInvalid(message);

      if (!isMountedRef.current) {
        return;
      }

      setRows((previousRows) =>
        previousRows.map(
          (currentRow) =>
            currentRow._key ===
              row._key
              ? {
                ...currentRow,
                _saving: false,
                _rowError: message,
              }
              : currentRow,
        ),
      );

      Swal.fire({
        icon: "error",
        title: "Save Failed",
        text: message,
      });
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setPaidFilter("");
    setMethodFilter("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const filteredData = useMemo(() => {
    const term = String(
      searchTerm || "",
    )
      .toLowerCase()
      .trim();

    const fromDate = startDate
      ? ymdLocalStart(startDate)
      : null;

    const toDate = endDate
      ? ymdLocalEnd(endDate)
      : null;

    const filteredRows = (
      rows || []
    ).filter((row) => {
      const searchableText = `${row?.booking_id ?? ""
        } ${row?.booking_display_id ?? ""
        } ${row?.group_live_session_id ??
        ""
        } ${row?.teacher_name ?? ""
        } ${row?.student_name ?? ""
        } ${row?.subject_name ?? ""
        } ${row?.booking_date ?? ""
        } ${row?.slot_start ?? ""
        } ${row?.slot_end ?? ""
        } ${row?.paid_status ?? ""
        } ${row?.payout_method ?? ""
        }`
        .toLowerCase()
        .trim();

      const matchesSearch = term
        ? searchableText.includes(
          term,
        )
        : true;

      const matchesPaidStatus =
        paidFilter === ""
          ? true
          : String(
            row?.paid_status ||
            "",
          ).toLowerCase() ===
          String(
            paidFilter,
          ).toLowerCase();

      const matchesMethod =
        methodFilter === ""
          ? true
          : String(
            row?.payout_method ||
            "",
          ).toLowerCase() ===
          String(
            methodFilter,
          ).toLowerCase();

      const itemDate =
        parseSqlLikeDateTime(
          row?.booking_date,
        );

      const matchesFromDate = fromDate
        ? itemDate
          ? itemDate >= fromDate
          : false
        : true;

      const matchesToDate = toDate
        ? itemDate
          ? itemDate <= toDate
          : false
        : true;

      return (
        matchesSearch &&
        matchesPaidStatus &&
        matchesMethod &&
        matchesFromDate &&
        matchesToDate
      );
    });

    return filteredRows
      .slice()
      .sort((firstRow, secondRow) => {
        const firstDate =
          parseSqlLikeDateTime(
            firstRow?.booking_date,
          );

        const secondDate =
          parseSqlLikeDateTime(
            secondRow?.booking_date,
          );

        const firstTimestamp =
          firstDate
            ? firstDate.getTime()
            : -Infinity;

        const secondTimestamp =
          secondDate
            ? secondDate.getTime()
            : -Infinity;

        return (
          secondTimestamp -
          firstTimestamp
        );
      });
  }, [
    rows,
    searchTerm,
    paidFilter,
    methodFilter,
    startDate,
    endDate,
  ]);

  const summary = useMemo(() => {
    const total = filteredData.length;

    const paid = filteredData.filter(
      (row) =>
        String(
          row?.paid_status,
        ).toLowerCase() === "paid",
    ).length;

    const unpaid = total - paid;

    const totalPayment =
      Number(totalTutorPayout) || 0;

    const totalProfit =
      Number(totalProfitApi) || 0;

    return {
      total,
      paid,
      unpaid,
      totalProfit,
      totalPayment,
    };
  }, [
    filteredData,
    totalProfitApi,
    totalTutorPayout,
  ]);

  const getExportRows = () =>
    filteredData.map(
      (item, index) => ({
        "S.L": index + 1,

        "Booking ID":
          item?.booking_display_id ||
          item?.booking_id ||
          "—",

        "Teacher Name":
          item?.teacher_name || "—",

        "Student Name":
          item?.student_name || "—",

        "Subject Name":
          item?.subject_name || "—",

        "Booking Date": fmtDate(
          item?.booking_date,
        ),

        "Slot Start": fmtTime(
          item?.slot_start,
        ),

        "Slot End": fmtTime(
          item?.slot_end,
        ),

        "Grade Wise Session Fee":
          money(
            parseAmount(
              item?.session_fee_aed,
            ),
          ),

        "Payment Amount (AED)":
          money(
            parseAmount(
              item?.payment_amount_aed,
            ),
          ),

        "Paid Status":
          formatExportStatus(
            item?.paid_status,
          ),

        "Paid On": item?.paid_on
          ? fmtDate(item.paid_on)
          : "—",

        "Payout Method":
          item?.payout_method || "—",
      }),
    );

  const exportToExcel = () => {
    const exportRows =
      getExportRows();

    if (!exportRows.length) {
      Swal.fire({
        icon: "info",
        title: "No Data",
        text: "No records available to export.",
      });

      return;
    }

    const heading = [
      ["Teacher Payout List"],
    ];

    const worksheet =
      XLSX.utils.json_to_sheet(
        exportRows,
        {
          origin: "A3",
        },
      );

    XLSX.utils.sheet_add_aoa(
      worksheet,
      heading,
      {
        origin: "A1",
      },
    );

    XLSX.utils.sheet_add_aoa(
      worksheet,
      [
        [
          `Total: ${summary.total}`,
          `Paid: ${summary.paid}`,
          `Unpaid: ${summary.unpaid}`,
          `Total Revenue: ${money(
            totalRevenue,
          )}`,
          `Total Profit: ${money(
            summary.totalProfit,
          )}`,
          `Total Paid Amount: ${money(
            summary.totalPayment,
          )}`,
        ],
      ],
      {
        origin: "A2",
      },
    );

    worksheet["!cols"] = [
      { wch: 8 },
      { wch: 16 },
      { wch: 24 },
      { wch: 35 },
      { wch: 22 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 24 },
      { wch: 22 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
    ];

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Teacher Payouts",
    );

    XLSX.writeFile(
      workbook,
      "teacher-payout-list.xlsx",
    );
  };

  const exportToPDF = () => {
    const exportRows =
      getExportRows();

    if (!exportRows.length) {
      Swal.fire({
        icon: "info",
        title: "No Data",
        text: "No records available to export.",
      });

      return;
    }

    const document = new jsPDF(
      "l",
      "mm",
      "a4",
    );

    document.setFontSize(16);

    document.text(
      "Teacher Payout List",
      14,
      16,
    );

    document.setFontSize(9);

    document.text(
      `Total: ${summary.total} | Paid: ${summary.paid} | Unpaid: ${summary.unpaid
      } | Total Revenue: ${money(
        totalRevenue,
      )} | Total Profit: ${money(
        summary.totalProfit,
      )} | Total Paid Amount: ${money(
        summary.totalPayment,
      )}`,
      14,
      23,
    );

    const columns = [
      "S.L",
      "Booking ID",
      "Teacher Name",
      "Student Name",
      "Subject Name",
      "Booking Date",
      "Slot Start",
      "Slot End",
      "Grade Fee",
      "Payment Amount",
      "Paid Status",
      "Paid On",
      "Method",
    ];

    const body = filteredData.map(
      (item, index) => [
        index + 1,

        item?.booking_display_id ||
        item?.booking_id ||
        "—",

        item?.teacher_name || "—",
        item?.student_name || "—",
        item?.subject_name || "—",

        fmtDate(item?.booking_date),
        fmtTime(item?.slot_start),
        fmtTime(item?.slot_end),

        money(
          parseAmount(
            item?.session_fee_aed,
          ),
        ),

        money(
          parseAmount(
            item?.payment_amount_aed,
          ),
        ),

        formatExportStatus(
          item?.paid_status,
        ),

        item?.paid_on
          ? fmtDate(item.paid_on)
          : "—",

        item?.payout_method || "—",
      ],
    );

    autoTable(document, {
      startY: 28,
      head: [columns],
      body,

      styles: {
        fontSize: 7,
        cellPadding: 2,
        overflow: "linebreak",
      },

      headStyles: {
        fontSize: 7,
        fontStyle: "bold",
      },

      columnStyles: {
        0: { cellWidth: 9 },
        1: { cellWidth: 18 },
        2: { cellWidth: 26 },
        3: { cellWidth: 34 },
        4: { cellWidth: 24 },
        5: { cellWidth: 18 },
        6: { cellWidth: 16 },
        7: { cellWidth: 16 },
        8: { cellWidth: 22 },
        9: { cellWidth: 24 },
        10: { cellWidth: 16 },
        11: { cellWidth: 18 },
        12: { cellWidth: 16 },
      },

      margin: {
        top: 28,
        left: 8,
        right: 8,
      },
    });

    document.save(
      "teacher-payout-list.pdf",
    );
  };

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredData.length /
      itemsPerPage,
    ),
  );

  useEffect(() => {
    setCurrentPage((page) =>
      Math.min(
        Math.max(1, page),
        totalPages,
      ),
    );
  }, [totalPages]);

  const indexOfLastItem =
    currentPage * itemsPerPage;

  const indexOfFirstItem =
    indexOfLastItem -
    itemsPerPage;

  const currentItems =
    filteredData.slice(
      indexOfFirstItem,
      indexOfLastItem,
    );

  return (
    <div className="card h-100 p-0 radius-12">
      <style>{`
        .sub-muted {
          opacity: 0.75;
          font-size: 12px;
        }

        .sub-card {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
          padding: 14px 16px;
          background: rgba(0, 0, 0, 0.02);
          height: 100%;
        }

        [data-bs-theme="dark"] .sub-card,
        [data-theme="dark"] .sub-card,
        .dark .sub-card {
          border-color: rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
        }

        .cell-strong {
          font-weight: 600;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        }

        .amount-input {
          min-width: 170px;
        }

        .date-input {
          min-width: 160px;
        }

        .method-select {
          min-width: 140px;
        }

        [data-bs-theme="dark"] .date-input,
        [data-theme="dark"] .date-input,
        .dark .date-input {
          background-color: rgba(255, 255, 255, 0.04) !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
          color: rgba(255, 255, 255, 0.92) !important;
          color-scheme: dark;
        }

        [data-bs-theme="dark"] .date-input:disabled,
        [data-theme="dark"] .date-input:disabled,
        .dark .date-input:disabled {
          background-color: rgba(255, 255, 255, 0.06) !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
          color: rgba(255, 255, 255, 0.45) !important;
          opacity: 1 !important;
          -webkit-text-fill-color: rgba(255, 255, 255, 0.45) !important;
        }

        [data-bs-theme="dark"] .date-input::-webkit-calendar-picker-indicator,
        [data-theme="dark"] .date-input::-webkit-calendar-picker-indicator,
        .dark .date-input::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 0.9;
        }

        .row-error {
          color: #dc3545;
          font-size: 12px;
          margin-top: 6px;
        }
      `}</style>

      <div className="card-header border-bottom bg-base py-16 px-24 d-flex align-items-center flex-wrap gap-3 justify-content-between">
        <div className="d-flex align-items-center flex-wrap gap-3">
          <input
            type="text"
            className="form-control w-auto"
            placeholder="Search booking / teacher / student / subject"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(
                event.target.value,
              );

              setCurrentPage(1);
            }}
          />

          <input
            type="date"
            className="form-control w-auto"
            value={startDate}
            onChange={(event) => {
              setStartDate(
                event.target.value,
              );

              setCurrentPage(1);
            }}
            title="From booking date"
          />

          <input
            type="date"
            className="form-control w-auto"
            value={endDate}
            onChange={(event) => {
              setEndDate(
                event.target.value,
              );

              setCurrentPage(1);
            }}
            title="To booking date"
          />

          <select
            className="form-select form-select-sm w-auto"
            value={paidFilter}
            onChange={(event) => {
              setPaidFilter(
                event.target.value,
              );

              setCurrentPage(1);
            }}
          >
            <option value="">
              Paid: All
            </option>

            <option value="Paid">
              Paid
            </option>

            <option value="Unpaid">
              Unpaid
            </option>
          </select>

          <select
            className="form-select form-select-sm w-auto"
            value={methodFilter}
            onChange={(event) => {
              setMethodFilter(
                event.target.value,
              );

              setCurrentPage(1);
            }}
          >
            <option value="">
              Method: All
            </option>

            <option value="Cash">
              Cash
            </option>

            <option value="Bank">
              Bank
            </option>

            <option value="Online">
              Online
            </option>
            <option value="UK Bank Account">
              UK Bank Account
            </option>
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="btn btn-outline-secondary btn-sm"
          >
            Reset Filters
          </button>

          <button
            type="button"
            onClick={exportToExcel}
            className="btn btn-success btn-sm"
            disabled={loading}
          >
            Excel Export
          </button>

          <button
            type="button"
            onClick={exportToPDF}
            className="btn btn-danger btn-sm"
            disabled={loading}
          >
            PDF Export
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchTeacherPayouts();
            fetchTotalRevenue();
          }}
          className="btn btn-outline-primary btn-sm"
          disabled={loading}
        >
          {loading
            ? "Refreshing..."
            : "Refresh"}
        </button>
      </div>

      <div className="card-body p-24">
        {error ? (
          <div className="alert alert-danger mb-3">
            {error}
          </div>
        ) : null}

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-3">
            <div className="sub-card">
              <div className="sub-muted">
                Total
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {summary.total}
              </div>
            </div>
          </div>

          <div className="col-12 col-md-3">
            <div className="sub-card">
              <div className="sub-muted">
                Paid / Unpaid
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {summary.paid} /{" "}
                {summary.unpaid}
              </div>
            </div>
          </div>

          <div className="col-12 col-md-3">
            <div className="sub-card">
              <div className="sub-muted">
                Total Revenue
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {money(totalRevenue)}
              </div>
            </div>
          </div>

          <div className="col-12 col-md-3">
            <div className="sub-card">
              <div className="sub-muted">
                Total Profit
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {money(
                  summary.totalProfit,
                )}
              </div>
            </div>
          </div>

          <div className="col-12 col-md-3">
            <div className="sub-card">
              <div className="sub-muted">
                Total Paid Amount
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {money(
                  summary.totalPayment,
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table bordered-table sm-table mb-0">
            <thead>
              <tr>
                <th style={{ width: 70 }}>
                  S.L
                </th>

                <th>Booking ID</th>
                <th>Teacher Name</th>
                <th>Student Name</th>
                <th>Subject Name</th>
                <th>Booking Date</th>
                <th>Slot Start</th>
                <th>Slot End</th>

                <th>
                  Grade Wise Session Fee
                </th>

                <th>
                  Payment Amount (AED)
                </th>

                <th>Paid?</th>
                <th>Paid on</th>
                <th>Payout Method</th>

                <th style={{ width: 120 }}>
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={14}
                    className="text-center"
                  >
                    <div className="py-4">
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : currentItems.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="text-center"
                  >
                    <div className="py-4">
                      <div
                        style={{
                          fontWeight: 700,
                        }}
                      >
                        No records found.
                      </div>

                      <div className="sub-muted">
                        Try clearing filters
                        or search.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                currentItems.map(
                  (row, index) => {
                    const isPaid =
                      getPaidStatus(
                        row,
                      ) === "Paid";

                    const radioName =
                      `paid-${row._key}`;

                    return (
                      <tr key={row._key}>
                        <td>
                          {indexOfFirstItem +
                            index +
                            1}
                        </td>

                        <td className="mono cell-strong">
                          {row.booking_display_id ||
                            row.booking_id ||
                            "—"}
                        </td>

                        <td className="cell-strong">
                          {
                            row.teacher_name
                          }
                        </td>

                        <td
                          style={{
                            whiteSpace:
                              "normal",

                            minWidth:
                              row.is_group_booking
                                ? 220
                                : undefined,
                          }}
                        >
                          {
                            row.student_name
                          }

                          {row.is_group_booking ? (
                            <div className="sub-muted mt-1">
                              {
                                row.student_count
                              }{" "}
                              student
                              {row.student_count ===
                                1
                                ? ""
                                : "s"}
                            </div>
                          ) : null}
                        </td>

                        <td>
                          {
                            row.subject_name
                          }
                        </td>

                        <td>
                          {fmtDate(
                            row.booking_date,
                          )}
                        </td>

                        <td className="mono">
                          {fmtTime(
                            row.slot_start,
                          )}
                        </td>

                        <td className="mono">
                          {fmtTime(
                            row.slot_end,
                          )}
                        </td>

                        <td>
                          {money(
                            parseAmount(
                              row.session_fee_aed,
                            ),
                          )}
                        </td>

                        <td>
                          <input
                            className="form-control form-control-sm amount-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Enter amount"
                            value={
                              row.payment_amount_aed
                            }
                            onChange={(
                              event,
                            ) =>
                              updatePaymentAmount(
                                row._key,
                                event.target
                                  .value,
                              )
                            }
                          />

                          {row._rowError ? (
                            <div className="row-error">
                              {
                                row._rowError
                              }
                            </div>
                          ) : null}
                        </td>

                        <td>
                          <div className="d-flex gap-3 flex-wrap">
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="radio"
                                name={
                                  radioName
                                }
                                id={`paid-yes-${row._key}`}
                                checked={
                                  isPaid
                                }
                                onChange={() =>
                                  updatePaidStatus(
                                    row._key,
                                    "Paid",
                                  )
                                }
                              />

                              <label
                                className="form-check-label"
                                htmlFor={`paid-yes-${row._key}`}
                              >
                                Paid
                              </label>
                            </div>

                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="radio"
                                name={
                                  radioName
                                }
                                id={`paid-no-${row._key}`}
                                checked={
                                  !isPaid
                                }
                                onChange={() =>
                                  updatePaidStatus(
                                    row._key,
                                    "Unpaid",
                                  )
                                }
                              />

                              <label
                                className="form-check-label"
                                htmlFor={`paid-no-${row._key}`}
                              >
                                Unpaid
                              </label>
                            </div>
                          </div>

                          <div className="mt-2">
                            <span
                              className={`badge ${badgeClassByStatus(
                                row.paid_status,
                              )}`}
                            >
                              {
                                row.paid_status
                              }
                            </span>

                            {row._dirty ? (
                              <span className="badge bg-warning text-dark ms-2">
                                Unsaved
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td>
                          <input
                            className="form-control form-control-sm date-input"
                            type="date"
                            value={
                              row.paid_on ||
                              ""
                            }
                            disabled={
                              !isPaid
                            }
                            onChange={(
                              event,
                            ) =>
                              updatePaidOn(
                                row._key,
                                event.target
                                  .value,
                              )
                            }
                          />
                        </td>

                        <td>
                          <select
                            className="form-select form-select-sm method-select"
                            value={
                              row.payout_method ||
                              ""
                            }
                            onChange={(
                              event,
                            ) =>
                              updateMethod(
                                row._key,
                                event.target
                                  .value,
                              )
                            }
                          >
                            <option value="">
                              Select
                            </option>

                            <option value="Cash">
                              Cash
                            </option>

                            <option value="Bank">
                              Bank
                            </option>

                            <option value="Online">
                              Online
                            </option>
                            <option value="UK Bank Account">
                              UK Bank Account
                            </option>
                          </select>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={
                              !row._dirty ||
                              row._saving
                            }
                            onClick={() =>
                              saveRow(row)
                            }
                          >
                            {row._saving
                              ? "Saving..."
                              : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  },
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="d-flex justify-content-between mt-3 flex-wrap gap-2">
          <span>
            Showing{" "}
            {filteredData.length === 0
              ? 0
              : indexOfFirstItem + 1}{" "}
            to{" "}
            {Math.min(
              indexOfLastItem,
              filteredData.length,
            )}{" "}
            of {filteredData.length}{" "}
            entries
          </span>

          <ul className="pagination mb-0">
            {Array.from({
              length: totalPages,
            }).map((_, index) => (
              <li
                key={index}
                className={`page-item ${currentPage ===
                  index + 1
                  ? "active"
                  : ""
                  }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage(
                      index + 1,
                    )
                  }
                  className="page-link"
                >
                  {index + 1}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TeacherPayoutListPage;