// src/components/TeacherDetailsModal.jsx
import React, { useMemo, useState, useEffect } from "react";
import Swal from "sweetalert2";
import axios from "axios";
import moment from "moment";
import { TreeSelect } from "antd";

import { getToken } from "../api/getToken";
import { uploadFileAws } from "../api/uploadFileAws";
import { getNationalities } from "../api/getNationalities";
import { getTimezonesLookup } from "../api/getTimezonesLookup";
import { loadTreeSubjects } from "../api/loadTreeSubjects";
import { getSubjectsLookup } from "../api/getSubjectsLookup";
import { API_URL } from "../constant/api";

const headers = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
};

const FETCH_PROFILE_URL =
  API_URL + "teacher_profile";
const UPDATE_PROFILE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=update_user_profile";
const ADD_PROFILE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=add_user_profile";

const DEFAULT_AVATAR =
  "https://gostudy.ae/assets/person-dummy.jpg";

// ---------------- helpers ----------------
function splitName(fullname = "") {
  const clean = String(fullname || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstname: "", lastname: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstname: parts[0], lastname: "" };
  return { firstname: parts[0], lastname: parts.slice(1).join(" ") };
}

const safeParseObj = (val) => {
  if (!val) return null;
  if (typeof val === "object") return val;
  if (typeof val !== "string") return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
};

const safeJsonParseArray = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val !== "string") return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// ✅ strict-ish email check (blocks ^ etc)
const isValidEmail = (email) => {
  const e = String(email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
};

// "" -> null for date/db fields
const nullIfEmpty = (v) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

// number coercion (empty -> null)
const numOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// "HH:mm" normalize (API sample uses 10:00)
const normalizeTimeHHMM = (t) => {
  const v = String(t || "").trim();
  if (!v) return "";
  const m = moment(v, ["HH:mm", "HH:mm:ss", "hh:mm A", "hh:mmA"], true);
  if (!m.isValid()) return v;
  return m.format("HH:mm");
};

/// ---------- Availability helpers ----------
const toMinutes = (hhmm) => {
  const m = moment(String(hhmm || "").trim(), ["HH:mm"], true);
  if (!m.isValid()) return null;
  return m.hours() * 60 + m.minutes();
};

const plusOneHourHHMM = (hhmm) => {
  const m = moment(String(hhmm || "").trim(), ["HH:mm"], true);
  if (!m.isValid()) return "";
  const m2 = m.clone().add(1, "hour");
  // prevent crossing day
  if (m2.date() !== m.date()) return "";
  return m2.format("HH:mm");
};

const prettyTime = (hhmm) => {
  const m = moment(String(hhmm || "").trim(), ["HH:mm"], true);
  return m.isValid() ? m.format("hh:mm A") : "";
};

const isOverlappingAvailability = (nextAvailability, candidate) => {
  const all = [];
  const pushIfValid = (type, index, s) => {
    const start = toMinutes(s?.from);
    const end = toMinutes(s?.to);
    if (start == null || end == null) return;
    all.push({ type, index, day: s?.day || "Monday", start, end });
  };

  (nextAvailability?.slots || []).forEach((s, i) => pushIfValid("normal", i, s));
  (nextAvailability?.groupSlots || []).forEach((s, i) => pushIfValid("group", i, s));

  if (candidate.start == null || candidate.end == null) return false;

  return all.some((x) => {
    if (x.day !== candidate.day) return false;
    if (x.type === candidate.type && x.index === candidate.index) return false;
    return candidate.start < x.end && candidate.end > x.start;
  });
};

// load_tree_subjects => normalized nodes
const normalizeSubjectsTree = (apiRows = []) => {
  const safeChildren = (raw) => {
    const arr = safeJsonParseArray(raw);
    return arr
      .filter((c) => c && c.key != null && c.label != null)
      .map((c) => {
        const keyStr = String(c.key);
        const parts = keyStr.split("-");
        const subjectId = parts?.[1] ? String(parts[1]) : "";
        return {
          key: keyStr,
          label: c.label,
          selectable: true,
          data: { subjectId, subjectcategory_id: c.subjectcategory_id },
        };
      });
  };

  return (apiRows || []).map((cat) => ({
    key: String(cat.key),
    label: cat.label,
    selectable: false,
    children: safeChildren(cat.children),
  }));
};

// ✅ old PrimeReact selectionKeys compatibility (if API saved object earlier)
const isCheckedKey = (selectionKeys, key) => {
  const v = selectionKeys?.[key];
  if (v === true) return true;
  if (v && typeof v === "object" && v.checked === true) return true;
  return false;
};

const computeSelectedSubjectIds = (selectionKeys, nodes) => {
  if (!selectionKeys) return [];
  const ids = [];
  const walk = (list) => {
    for (const n of list || []) {
      if (n.children?.length) walk(n.children);
      else if (isCheckedKey(selectionKeys, n.key)) {
        const subjectId = n?.data?.subjectId;
        if (subjectId) ids.push(String(subjectId));
      }
    }
  };
  walk(nodes || []);
  return Array.from(new Set(ids));
};

const TeacherDetailsModal = ({ show, onClose, userid, seed, onSave }) => {
  const isAddMode = userid == null;
  const seedUserId = seed?.id;

  const modeLabel = isAddMode ? "Add Teacher Details" : "Update Teacher Details";

  const [currentStep, setCurrentStep] = useState(1);

  const steps = useMemo(
    () => [
      { id: 1, label: "Personal Details" },
      { id: 2, label: "Educational Details" },
      { id: 3, label: "Teaching Profile" },
      { id: 4, label: "Video Introduction" },
      { id: 5, label: "Availability" },
    ],
    []
  );
  const totalSteps = steps.length;

  // dropdowns
  const [nationalities, setNationalities] = useState([]);
  const [timezones, setTimezones] = useState([]);

  // loading/saving
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // image preview
  const [selectedImage, setSelectedImage] = useState(null);

  // step 4 mode
  const [videoIntroMode, setVideoIntroMode] = useState("link");
  const [ytVideoId, setYtVideoId] = useState("");
  const [localVideoPreview, setLocalVideoPreview] = useState("");
  const [localThumbPreview, setLocalThumbPreview] = useState("");

  // subjects
  const [subjectTreeNodes, setSubjectTreeNodes] = useState([]);
  const [subjectsLookup, setSubjectsLookup] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectError, setSubjectError] = useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]); // ✅ AntD value (array of subjectIds)
  const [savedSubjectKeysForRestore, setSavedSubjectKeysForRestore] = useState(null);

  const subjectTreeData = useMemo(() => {
    // AntD treeData format
    return (subjectTreeNodes || []).map((cat) => ({
      title: cat.label,
      value: `${cat.key}`,
      key: `cat-${cat.key}`,
      disabled: cat.children.length !== 0,// ✅ category not selectable
      selectable: cat.children.length == 0,
      children: (cat.children || []).map((sub) => ({
        title: sub.label,
        value: sub?.key, // ✅ leaf value = subjectId
        key: `sub-${sub?.data?.subjectId || sub.key}`,
        isLeaf: true,
      })),
    }));
  }, [subjectTreeNodes]);

  // hidden ids from API (for update)
  const [ids, setIds] = useState({
    profileId: null,
    teachingProfileId: null,
    videoId: null,
  });

  // ✅ delete trackers (UPDATE MODE)
  const [deletedAvailabilityIds, setDeletedAvailabilityIds] = useState([]); // [{id,isGroup}]
  const [deletedEducationIds, setDeletedEducationIds] = useState([]); // [id,id]

  // ✅ NEW: focus tracker for pretty time display
  const [focusedTime, setFocusedTime] = useState(null); // { type: "normal"|"group", index: number }

  // form
  const [form, setForm] = useState({
    userid: "",
    is_active: "",
    createddate: "",
    firstname: "",
    lastname: "",
    email: "",
    phonenumber: "",
    nationalityid: "",
    dob: "",
    gender: "",
    street: "",
    area: "",
    city: "",
    postcode: "",
    imagepath: "",
    passportid: "",
    drivinglicense: "",
    timezoneid: "",

    subjectid: "",
    subjects: "",
    introduceyourself: "",
    teachexp: "",
    motivate: "",
    headline: "",

    videolink: "",
    videofile: "",
    thumbnails: "",
    videodesc: "",
  });

  // ✅ education multiple rows
  const emptyEduRow = () => ({
    id: null,
    university: "",
    degreeType: "",
    degree: "",
    specialisation: "",
    startdate: "",
    enddate: "",
    certificate: "",
  });

  const [educationList, setEducationList] = useState([emptyEduRow()]);

  // ✅ availability (group participants default 2)
  const [availability, setAvailability] = useState({
    timezone: "Asia/Karachi",
    tzConfirmed: true,
    slots: [{ id: null, day: "Monday", from: "", to: "", participants: 2 }],
    groupSlots: [{ id: null, day: "Monday", from: "", to: "", participants: 2 }],
  });

  // ---------- youtube helper ----------
  const extractYouTubeId = (url = "") => {
    try {
      const u = (url || "").trim();
      const shortMatch = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
      if (shortMatch?.[1]) return shortMatch[1];
      const vMatch = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
      if (vMatch?.[1]) return vMatch[1];
      const embedMatch = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
      if (embedMatch?.[1]) return embedMatch[1];
      const shortsMatch = u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/);
      if (shortsMatch?.[1]) return shortsMatch[1];
      return "";
    } catch {
      return "";
    }
  };
  const ytEmbedUrl = ytVideoId ? `https://www.youtube.com/embed/${ytVideoId}` : "";

  // cleanup object urls
  useEffect(() => {
    return () => {
      if (localVideoPreview) URL.revokeObjectURL(localVideoPreview);
      if (localThumbPreview) URL.revokeObjectURL(localThumbPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- fetch dropdowns ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await getNationalities();
        setNationalities(res || []);
      } catch (e) {
        console.error("getNationalities error:", e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await getTimezonesLookup();
        if (res?.statusCode === 200) setTimezones(res?.data || []);
      } catch (e) {
        console.error("getTimezonesLookup error:", e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await getSubjectsLookup();
        if (res?.statusCode === 200) setSubjectsLookup(res?.data || []);
      } catch (e) {
        console.error("getSubjectsLookup error:", e);
      }
    })();
  }, []);

  // ✅ subjects tree load ONLY ONCE (no loop)
  useEffect(() => {
    (async () => {
      setSubjectLoading(true);
      setSubjectError("");
      try {
        const res = await loadTreeSubjects();
        if (res?.statusCode === 200) {
          const nodes = normalizeSubjectsTree(res?.data || []);
          setSubjectTreeNodes(nodes);
        } else {
          setSubjectTreeNodes([]);
          setSubjectError(res?.message || "Subjects load failed");
        }
      } catch (e) {
        setSubjectTreeNodes([]);
        setSubjectError(e?.message || "Subjects load failed");
      } finally {
        setSubjectLoading(false);
      }
    })();
  }, []);

  // ✅ restore subjects WHEN both tree + savedKeys available
  useEffect(() => {
    if (!savedSubjectKeysForRestore) return;
    if (!subjectTreeNodes?.length) return;
    console.log({ savedSubjectKeysForRestore });
    // saved could be:
    // 1) array ["12","15"] (new)
    // 2) old PrimeReact selectionKeys object (legacy)
    const maybeArr = Array.isArray(savedSubjectKeysForRestore)
      ? savedSubjectKeysForRestore
      : safeJsonParseArray(savedSubjectKeysForRestore);

    if (Array.isArray(maybeArr) && maybeArr.length) {
      const clean = Object.keys(savedSubjectKeysForRestore).filter(c => c.includes("-"))//maybeArr.map(String).filter((v) => v && v !== "null");
      setSelectedSubjectIds(Object.keys(savedSubjectKeysForRestore).filter(c => c.includes("-")));
      //setSelectedSubjectIds(clean);
      setForm((p) => ({
        ...p,
        subjectid: clean.join(","),
        subjects: JSON.stringify(clean),
      }));
      return;
    }

    // legacy object
    if (typeof savedSubjectKeysForRestore === "object") {
      const idsArr = Object.keys(savedSubjectKeysForRestore).filter(c => c.includes("-"));//computeSelectedSubjectIds(savedSubjectKeysForRestore, subjectTreeNodes);
      setSelectedSubjectIds(idsArr);
      setForm((p) => ({
        ...p,
        subjectid: idsArr.join(","),
        subjects: JSON.stringify(idsArr), // ✅ store clean array going forward
      }));
    }
  }, [savedSubjectKeysForRestore, subjectTreeNodes]);

  // ---------- open modal: reset + fetch ----------
  useEffect(() => {
    if (!show) return;

    setCurrentStep(1);
    setDeletedAvailabilityIds([]);
    setDeletedEducationIds([]);

    if (isAddMode) {
      const { firstname, lastname } = splitName(seed?.fullname || "");
      setIds({ profileId: null, teachingProfileId: null, videoId: null });

      setForm((p) => ({
        ...p,
        userid: seedUserId || "",
        firstname,
        lastname,
        email: seed?.email || "",
        phonenumber: seed?.phonenumber || "",
        is_active: "",
        createddate: "",
        nationalityid: "",
        dob: "",
        gender: "",
        street: "",
        area: "",
        city: "",
        postcode: "",
        imagepath: "",
        passportid: "",
        drivinglicense: "",
        timezoneid: "",
        subjectid: "",
        subjects: "",
        introduceyourself: "",
        teachexp: "",
        motivate: "",
        headline: "",
        videolink: "",
        videofile: "",
        thumbnails: "",
        videodesc: "",
      }));

      setEducationList([emptyEduRow()]);
      setSelectedImage(null);
      setSavedSubjectKeysForRestore(null);
      setSelectedSubjectIds([]); // ✅ reset AntD selection

      setAvailability({
        timezone: "Asia/Karachi",
        tzConfirmed: true,
        slots: [{ id: null, day: "Monday", from: "", to: "", participants: 2 }],
        groupSlots: [{ id: null, day: "Monday", from: "", to: "", participants: 2 }],
      });

      setVideoIntroMode("link");
      setYtVideoId("");
      return;
    }

    // EDIT MODE: fetch teacher_profile
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Token not found");

        const res = await axios.post(
          FETCH_PROFILE_URL,
          { token, teacherid: userid },
          { headers }
        );

        if (res?.data?.statusCode !== 200) {
          Swal.fire("Error", res?.data?.message || "Failed to load profile", "error");
          return;
        }

        const data = res.data.data || {};
        const profile = data.profile?.[0] || {};
        const eduList = Array.isArray(data.educationdeails) ? data.educationdeails : [];
        const tp = data.teachingprofile?.[0] || {};
        const vid = data.video?.[0] || {};

        setIds({
          profileId: profile?.id ?? null,
          teachingProfileId: tp?.id ?? null,
          videoId: vid?.id ?? null,
        });

        // subjects restore (can be array JSON or legacy object JSON)
        const savedKeys = safeParseObj(tp?.subjects) || null;
        setSavedSubjectKeysForRestore(savedKeys);

        setForm((p) => ({
          ...p,
          userid: profile?.userid ?? userid,
          firstname: profile?.firstname || "",
          lastname: profile?.lastname || "",
          email: profile?.email || "",
          is_active: profile?.is_active ?? "",
          createddate: profile?.createddate ?? profile?.user_createddate ?? "",
          phonenumber: profile?.phonenumber || "",
          nationalityid: String(profile?.nationalityid ?? "") || "",
          dob: profile?.dob || "",
          gender: profile?.gender || "",
          street: profile?.street || "",
          area: profile?.area || "",
          city: profile?.city || "",
          postcode: profile?.postcode || "",
          imagepath: profile?.imagepath || "",
          passportid: profile?.passportid || "",
          drivinglicense: profile?.drivinglicense || "",
          timezoneid: String(profile?.timezoneid ?? "") || "",

          subjectid: String((profile?.subjectid ?? p.subjectid) || ""),
          subjects: tp?.subjects ? String(tp.subjects) : p.subjects,
          introduceyourself: profile?.intro || tp?.intro || "",
          teachexp: profile?.teachexp || tp?.teachexp || "",
          motivate: profile?.motivedesc || tp?.motivedesc || "",
          headline: profile?.headline || tp?.headline || "",

          // video mapping
          videolink: vid?.videolink || profile?.videolink || "",
          videofile: vid?.videopath || profile?.videopath || "",
          thumbnails: vid?.thumbnails || profile?.thumbnails || "",
          videodesc: vid?.description || profile?.description || "",
        }));

        setSelectedImage(profile?.imagepath || null);

        // ✅ education multiple rows
        if (eduList?.length) {
          const mapped = eduList
            .filter((e) => String(e?.deleted ?? "0") !== "1")
            .map((e) => ({
              id: e?.id ?? null,
              university: e?.university || "",
              degreeType: e?.degreetype || "",
              degree: e?.degree || "",
              specialisation: e?.specialization || "",
              startdate: e?.startdate || "",
              enddate: e?.enddate || "",
              certificate: e?.docpath || "",
            }));
          setEducationList(mapped.length ? mapped : [emptyEduRow()]);
        } else {
          setEducationList([emptyEduRow()]);
        }

        // availability prefer teacheravailability else profile.availability
        const availArr =
          Array.isArray(data.teacheravailability) && data.teacheravailability.length
            ? data.teacheravailability
            : safeJsonParseArray(profile?.availability);

        const tzId = profile?.timezoneid ?? "";
        const tzName =
          (timezones || []).find((t) => String(t.id) === String(tzId))?.timezone ||
          "Asia/Karachi";

        const normalSlots = [];
        const groupSlots = [];

        for (const a of availArr || []) {
          const isGroup = String(a?.isGroup ?? "0") === "1";
          const slot = {
            id: a?.id ?? null,
            day: a?.day || "Monday",
            from: a?.timefrom ? String(a.timefrom).slice(0, 5) : "",
            to: a?.timeto ? String(a.timeto).slice(0, 5) : "",
            participants: Number(a?.noofParticipants || (isGroup ? 2 : 2)),
          };
          if (isGroup) groupSlots.push(slot);
          else normalSlots.push(slot);
        }

        setAvailability({
          timezone: tzName,
          tzConfirmed: true,
          slots: normalSlots.length ? normalSlots : [{ id: null, day: "Monday", from: "", to: "", participants: 2 }],
          groupSlots: groupSlots.length ? groupSlots : [{ id: null, day: "Monday", from: "", to: "", participants: 2 }],
        });

        // video mode
        if ((vid?.videolink || "").trim()) {
          setVideoIntroMode("link");
          setYtVideoId(extractYouTubeId(vid.videolink));
        } else if ((vid?.videopath || "").trim() || (profile?.videopath || "").trim()) {
          setVideoIntroMode("upload");
          setYtVideoId("");
        } else {
          setVideoIntroMode("link");
          setYtVideoId("");
        }
      } catch (e) {
        console.error("teacher_profile error", e);
        Swal.fire("Error", "Failed to load teacher profile", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [show, userid, isAddMode, seedUserId, seed, timezones]);

  if (!show) return null;

  // ---------- handlers ----------
  const goToStep = (id) => setCurrentStep(Math.max(1, Math.min(totalSteps, id)));
  const nextStep = () => setCurrentStep((s) => Math.min(totalSteps, s + 1));
  const prevStep = () => setCurrentStep((s) => Math.max(1, s - 1));

  const segmentFill = (i) => {
    if (currentStep > i) return 100;
    if (currentStep === i) return 50;
    return 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  // uploads
  const uploadAndSet = async (file, fieldName, preview = false) => {
    if (!file) return null;

    Swal.fire({
      title: "Uploading...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const uploadedPath = await uploadFileAws(file);
      Swal.close();

      if (!uploadedPath) {
        Swal.fire("Error", "File upload failed.", "error");
        return null;
      }

      if (preview) setSelectedImage(URL.createObjectURL(file));
      setForm((p) => ({ ...p, [fieldName]: uploadedPath }));
      return uploadedPath;
    } catch (e) {
      Swal.close();
      Swal.fire("Error", "Upload failed.", "error");
      return null;
    }
  };

  // ✅ education handlers (multiple)
  const updateEducation = (index, key, value) => {
    setEducationList((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const addEducationRow = () => setEducationList((p) => [...p, emptyEduRow()]);

  const deleteEducationRow = (index) => {
    setEducationList((prev) => {
      const row = prev[index];
      if (row?.id) setDeletedEducationIds((d) => Array.from(new Set([...d, row.id])));
      if (prev.length === 1) return [emptyEduRow()];
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadEducationCertificate = async (index, file) => {
    if (!file) return null;

    Swal.fire({
      title: "Uploading...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const uploadedPath = await uploadFileAws(file);
      Swal.close();

      if (!uploadedPath) {
        Swal.fire("Error", "File upload failed.", "error");
        return null;
      }

      setEducationList((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], certificate: uploadedPath };
        return next;
      });
      return uploadedPath;
    } catch (e) {
      Swal.close();
      Swal.fire("Error", "Upload failed.", "error");
      return null;
    }
  };

  // ✅ availability handlers with delete tracking + auto time + overlap protection
  const updateSlot = (type, index, key, value) => {
    setAvailability((prev) => {
      const listKey = type === "group" ? "groupSlots" : "slots";

      const next = {
        ...prev,
        slots: [...prev.slots],
        groupSlots: [...prev.groupSlots],
      };

      const list = [...next[listKey]];
      const before = list[index] || {};
      const cur = { ...before };

      if (key === "from") {
        const raw = String(value || "").trim();

        // input type="time" should be HH:mm; if not valid just ignore (no swal spam)
        const m = moment(raw, ["HH:mm"], true);
        if (!m.isValid()) return prev;

        const fromHHMM = m.format("HH:mm");
        const toHHMM = plusOneHourHHMM(fromHHMM);
        if (!toHHMM) {
          Swal.fire("Invalid Time");
          return prev;
        }

        cur.from = fromHHMM;
        cur.to = toHHMM;
      } else if (key === "day") {
        cur.day = value || "Monday";
      } else if (key === "participants") {
        const n = Number(value);
        cur.participants = Number.isFinite(n) ? Math.max(2, Math.min(10, n)) : 2;
      } else {
        cur[key] = value;
      }

      list[index] = cur;
      next[listKey] = list;

      // ✅ overlap check only when both times valid
      const start = toMinutes(cur.from);
      const end = toMinutes(cur.to);

      if (start != null && end != null) {
        const candidate = {
          type: type === "group" ? "group" : "normal",
          index,
          day: cur.day,
          start,
          end,
        };

        if (isOverlappingAvailability(next, candidate)) {
          Swal.fire("Overlap with another Slot");
          return prev; // rollback
        }
      }

      return next;
    });
  };

  const addSlot = (type) => {
    setAvailability((prev) => {
      const item =
        type === "group"
          ? { id: null, day: "Monday", from: "", to: "", participants: 2 }
          : { id: null, day: "Monday", from: "", to: "", participants: 2 };
      return type === "group"
        ? { ...prev, groupSlots: [...prev.groupSlots, item] }
        : { ...prev, slots: [...prev.slots, item] };
    });
  };

  const deleteSlot = (type, index) => {
    setAvailability((prev) => {
      const list = type === "group" ? prev.groupSlots : prev.slots;
      const slot = list[index];

      if (slot?.id) {
        setDeletedAvailabilityIds((d) => {
          const next = [...d, { id: slot.id, isGroup: type === "group" ? "1" : "0" }];
          const uniq = [];
          const seen = new Set();
          for (const x of next) {
            const k = `${x.id}-${x.isGroup}`;
            if (!seen.has(k)) {
              seen.add(k);
              uniq.push(x);
            }
          }
          return uniq;
        });
      }

      if (list.length === 1) {
        const resetItem =
          type === "group"
            ? { id: null, day: "Monday", from: "", to: "", participants: 2 }
            : { id: null, day: "Monday", from: "", to: "", participants: 2 };

        return type === "group"
          ? { ...prev, groupSlots: [resetItem] }
          : { ...prev, slots: [resetItem] };
      }

      const nextList = list.filter((_, i) => i !== index);
      return type === "group" ? { ...prev, groupSlots: nextList } : { ...prev, slots: nextList };
    });
  };

  // ---------- validation ----------
  const validateAdd = () => {
    const teacherId = form.userid || seedUserId;
    if (!teacherId) return "Missing userid (seed id).";
    if (!form.firstname?.trim()) return "First name is required";
    if (!form.email?.trim()) return "Email is required";
    if (!isValidEmail(form.email)) return "Email format is invalid (remove special chars like ^).";
    if (!form.nationalityid) return "Please select a nationality";
    if (videoIntroMode === "link" && String(form.videolink || "").trim()) {
      const id = extractYouTubeId(form.videolink);
      if (!id) return "Invalid YouTube link — please paste a valid YouTube URL.";
    }
    return null;
  };

  // ---------- submit (final) ----------
  const handleFinalSubmit = async () => {
    const confirm = await Swal.fire({
      title: isAddMode ? "Add Teacher?" : "Update Teacher?",
      text: "This will save all steps data.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Save",
    });
    if (!confirm.isConfirmed) return;

    const v = isAddMode ? validateAdd() : null;
    if (v) return Swal.fire("Validation", v, "warning");

    try {
      setSaving(true);

      const token = await getToken();
      if (!token) throw new Error("Token not found");

      const tzIdResolved =
        (timezones || []).find(
          (t) => String(t.timezone) === String(availability.timezone)
        )?.id ||
        form.timezoneid ||
        "";

      const teacherIdNum = Number(form.userid || seedUserId || userid);

      // -------------------- BUILD SANITIZED SECTIONS --------------------

      // ✅ education active (skip empty rows)
      const educationActive = (educationList || [])
        .map((e) => {
          const hasId = !!e?.id;
          const hasAny =
            (e.university || "").trim() ||
            (e.degree || "").trim() ||
            (e.degreeType || "").trim() ||
            (e.specialisation || "").trim() ||
            (e.certificate || "").trim() ||
            (e.startdate || "").trim() ||
            (e.enddate || "").trim();

          if (!hasId && !hasAny) return null;

          return {
            ...(e?.id ? { id: e.id } : {}),
            userid: teacherIdNum,
            university: e?.university || "",
            degree: e?.degree || "",
            degreetype: e?.degreeType || "",
            specialization: e?.specialisation || "",
            otherSpecialization: "",
            docpath: e?.certificate ? String(e.certificate) : null,
            startdate: nullIfEmpty(e?.startdate),
            enddate: nullIfEmpty(e?.enddate),
            ...(isAddMode ? {} : { deleted: "0" }),
          };
        })
        .filter(Boolean);

      // ✅ education deleted (UPDATE only)
      const educationDeleted = !isAddMode
        ? (deletedEducationIds || [])
          .filter(Boolean)
          .map((id) => ({
            id,
            deleted: "1",
          }))
        : [];

      // ✅ availability active (skip empty)
      const buildActiveSlots = (list, isGroup) =>
        (list || [])
          .map((s) => {
            const tf = normalizeTimeHHMM(s.from);
            const tt = normalizeTimeHHMM(s.to);

            if (!String(tf || "").trim() || !String(tt || "").trim()) return null;

            return {
              ...(s.id ? { id: s.id } : {}),
              userid: teacherIdNum,
              createdby: teacherIdNum,
              day: s.day,
              timezoneid: numOrNull(tzIdResolved) ?? tzIdResolved,
              is_active: false,
              timefrom: tf,
              timeto: tt,
              isGroup: isGroup ? 1 : 0,
              noofParticipants: Number(s.participants || 2),
              ...(isAddMode ? {} : { deleted: "0" }),
            };
          })
          .filter(Boolean);

      const availabilityActive = [
        ...buildActiveSlots(availability.slots, false),
        ...buildActiveSlots(availability.groupSlots, true),
      ];

      // ✅ availability deleted (UPDATE only)
      const availabilityDeleted = !isAddMode
        ? (deletedAvailabilityIds || [])
          .filter((x) => x?.id)
          .map((x) => ({
            id: x.id,
            deleted: "1",
          }))
        : [];

      // ✅ teachingprofile OPTIONAL
      const teachingHasAny =
        String(form.subjectid || "").trim() ||
        String(form.subjects || "").trim() ||
        String(form.introduceyourself || "").trim() ||
        String(form.teachexp || "").trim() ||
        String(form.motivate || "").trim() ||
        String(form.headline || "").trim();

      const teachingprofileArr = teachingHasAny
        ? [
          {
            ...(isAddMode ? {} : { id: ids.teachingProfileId }),
            teacherid: teacherIdNum,
            subjectid: String(form.subjectid || ""),
            intro: form.introduceyourself || "",
            teachexp: form.teachexp || "",
            motivedesc: form.motivate || "",
            headline: form.headline || "",
            subjects: form.subjects || "",
          },
        ]
        : [];
      teachingprofileArr.forEach(tpa => {
        let __subjects = {};
        let __subjectsStr = tpa.subjects;
        JSON.parse(__subjectsStr).forEach(e => {
          __subjects[e] = { "checked": true }
        })
        tpa.subjects = JSON.stringify(__subjects);
      })
      console.clear();
      console.log({ teachingprofileArr })
      //return;
      // ✅ video OPTIONAL
      const videoHasAny =
        String(form.videofile || "").trim() ||
        String(form.videolink || "").trim() ||
        String(form.thumbnails || "").trim() ||
        String(form.videodesc || "").trim();

      if (videoIntroMode === "link" && String(form.videolink || "").trim()) {
        const id = extractYouTubeId(form.videolink);
        if (!id) {
          Swal.fire("Validation", "Invalid YouTube link — please paste a valid YouTube URL.", "warning");
          return;
        }
      }

      const videoArr = videoHasAny
        ? [
          {
            ...(isAddMode ? {} : { id: ids.videoId }),
            teacherid: teacherIdNum,
            videopath: form.videofile ? String(form.videofile) : "",
            videolink: form.videolink ? String(form.videolink) : "",
            thumbnails: form.thumbnails ? String(form.thumbnails) : "",
            description: form.videodesc ? String(form.videodesc) : "",
          },
        ]
        : [];

      // ✅ userdetail: match API keys
      const userdetailObj = {
        ...(isAddMode ? {} : { id: ids.profileId }),
        userid: teacherIdNum,
        firstname: form.firstname || "",
        lastname: form.lastname || "",
        email: form.email || "",
        phonenumber: form.phonenumber || "",
        country: "",
        nationality: numOrNull(form.nationalityid) ?? String(form.nationalityid || ""),
        dob: nullIfEmpty(form.dob) ?? "",
        gender: form.gender || "",
        language: "",
        level: "",
        imagepath: form.imagepath || "",
        passportid: form.passportid || "",
        drivinglicense: form.drivinglicense || "",
        parentemail: "",
        street: form.street || "",
        area: form.area || "",
        city: form.city || "",
        postcode: form.postcode || "",
        timezoneid: numOrNull(tzIdResolved) ?? String(tzIdResolved || ""),
      };

      const payload = {
        token,
        userdetail: [userdetailObj],
        educationdetails: isAddMode ? educationActive : [...educationActive, ...educationDeleted],
        teachingprofile: teachingprofileArr,
        video: videoArr,
        teacheravailability: isAddMode ? availabilityActive : [...availabilityActive, ...availabilityDeleted],
      };

      // -------------------- CALL API --------------------
      const url = isAddMode ? ADD_PROFILE_URL : UPDATE_PROFILE_URL;
      let res = await axios.post(url, payload, { headers });

      const ok = res?.data?.statusCode === 200 || res?.data?.success;

      // ✅ ADD fallback retry as update (your incomplete-profile scenario)
      if (!ok && isAddMode) {
        const msg = String(res?.data?.message || "").toLowerCase();
        const looksLikeIncomplete =
          msg.includes("incomplete") ||
          msg.includes("profile") ||
          msg.includes("required") ||
          msg.includes("validation");

        if (looksLikeIncomplete) {
          const res2 = await axios.post(UPDATE_PROFILE_URL, payload, { headers });
          const ok2 = res2?.data?.statusCode === 200 || res2?.data?.success;

          if (ok2) {
            Swal.fire({
              icon: "success",
              title: "Teacher saved!",
              text: "Add returned validation/incomplete, but update succeeded (profile saved).",
            });
            onSave?.();
            onClose();
            return;
          }

          Swal.fire("Failed", res2?.data?.message || res?.data?.message || "Unknown error", "error");
          return;
        }
      }

      if (!ok) {
        Swal.fire("Failed", res?.data?.message || "Unknown error", "error");
        return;
      }

      Swal.fire({
        icon: "success",
        title: isAddMode ? "Teacher added!" : "Teacher updated!",
        timer: 1500,
        showConfirmButton: false,
      });

      onSave?.();
      onClose();
    } catch (e) {
      console.error("save teacher error", e);
      Swal.fire("Error", "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const profileImg = selectedImage || form.imagepath || DEFAULT_AVATAR;
  const fullName = `${form.firstname || ""} ${form.lastname || ""}`.trim() || "—";

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <style>{`
            .wizardbar { display:flex; justify-content:center; gap:22px; padding:12px 8px 6px; }
            .wstep { position:relative; display:flex; flex-direction:column; align-items:center; min-width:92px; }
            .wcircle { width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; border:none; }
            .wlabel { margin-top:6px; font-size:11px; color:#6c757d; font-weight:600; text-align:center; }
            .wline { position:absolute; top:16px; left:54px; width:74px; height:6px; background:#e9ecef; border-radius:99px; overflow:hidden; }
            .wlineFill { height:100%; background:#0d6efd; border-radius:99px; width:0%; transition:width .2s ease; }
            .wbtn { background:transparent; border:none; padding:0; cursor:pointer; }

            .profileCard { background: #1f2937; color: #fff; border-radius: 12px; padding: 22px 16px; margin-bottom: 18px; }
            .profileAvatarWrap { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; }
            .profileAvatar { width: 120px; height: 120px; border-radius: 10px; object-fit: cover; background:#111827; border: 2px solid rgba(255,255,255,0.15); }
            .profileName { font-size: 25px; font-weight: 600; text-align:center; }

            /* ✅ AntD TreeSelect WOW look */
            .wow-subjects .ant-select-selector{
              border-radius:14px !important;
              min-height:46px !important;
              padding:7px 12px !important;
              border:1px solid #cbd5e1 !important;
              box-shadow: 0 6px 18px rgba(15,23,42,0.06);
            }
            .wow-subjects .ant-select-selection-overflow-item{
              margin-top:4px;
            }
            .wow-subjects .ant-select-selection-item{
              border-radius:999px !important;
              background:#eef2ff !important;
              border:1px solid #c7d2fe !important;
              color:#0f172a !important;
              padding:0 10px !important;
            }
            .ant-select-dropdown{ z-index: 9999 !important; }
            .dark-subjects .ant-select-selector{
  background:#0b1220 !important;
  border:1px solid rgba(148,163,184,0.35) !important;
  border-radius:14px !important;
  min-height:46px !important;
  padding:7px 12px !important;
  box-shadow: 0 10px 24px rgba(0,0,0,0.25);
}
.dark-subjects .ant-select-selection-placeholder{ color: rgba(226,232,240,0.65) !important; }
.dark-subjects .ant-select-selection-item{ color:#e2e8f0 !important; }
.dark-subjects .ant-select-arrow, 
.dark-subjects .ant-select-clear{ color: rgba(226,232,240,0.75) !important; }

.dark-subjects .ant-select-selection-item{
  border-radius:999px !important;
  background: rgba(99,102,241,0.18) !important;
  border:1px solid rgba(99,102,241,0.35) !important;
  color:#e2e8f0 !important;
}

.dark-subjects .ant-select-dropdown{
  background:#0b1220 !important;
  border:1px solid rgba(148,163,184,0.22) !important;
}
.dark-subjects .ant-select-tree{
  background:#0b1220 !important;
  color:#e2e8f0 !important;
}
.dark-subjects .ant-select-tree-treenode:hover{
  background: rgba(148,163,184,0.08) !important;
}
.dark-subjects .ant-select-tree-node-content-wrapper{
  color:#e2e8f0 !important;
}
.dark-subjects .ant-select-tree-node-content-wrapper:hover{
  background: rgba(148,163,184,0.10) !important;
}
.dark-subjects .ant-select-tree-checkbox .ant-select-tree-checkbox-inner{
  background:#111827 !important;
  border-color: rgba(148,163,184,0.4) !important;
}
          `}</style>

          {/* Header */}
          <div className="modal-header">
            <h5 className="modal-title">{modeLabel}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          {/* Wizard Header */}
          <div className="wizardbar">
            {steps.map((s, idx) => {
              const activeOrDone = currentStep >= s.id;
              const isLast = idx === steps.length - 1;

              return (
                <div className="wstep" key={s.id}>
                  <button type="button" className="wbtn" onClick={() => goToStep(s.id)}>
                    <div
                      className="wcircle"
                      style={{
                        background: activeOrDone ? "#0d6efd" : "#f1f3f5",
                        color: activeOrDone ? "#fff" : "#495057",
                      }}
                    >
                      {s.id}
                    </div>
                  </button>

                  {!isLast && (
                    <div className="wline">
                      <div className="wlineFill" style={{ width: `${segmentFill(s.id)}%` }} />
                    </div>
                  )}

                  <div className="wlabel">{s.label}</div>
                </div>
              );
            })}
          </div>

          <div className="modal-body">
            {loading ? (
              <p>Loading...</p>
            ) : (
              <>
                {/* profile card */}
                {currentStep === 1 && (
                  <div className="profileCard">
                    <div className="profileAvatarWrap">
                      <img src={profileImg} alt="Profile" className="profileAvatar" />
                      <label className="btn btn-outline-primary" htmlFor="uploadProfileImage">
                        Upload Profile Image
                      </label>
                      <input
                        id="uploadProfileImage"
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          await uploadAndSet(file, "imagepath", true);
                        }}
                      />
                      <div className="profileName">{fullName}</div>
                      <div style={{ textAlign: "center", marginTop: 6 }}>
                        <span
                          className={`badge ${String(form.is_active) === "1" ? "bg-success" : "bg-danger"}`}
                          style={{ fontSize: 12, padding: "6px 10px" }}
                        >
                          {String(form.is_active) === "1" ? "Active" : "Inactive"}
                        </span>

                        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
                          Joined:{" "}
                          {form.createddate && moment(form.createddate).isValid()
                            ? moment(form.createddate).format("DD MMM YYYY")
                            : "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 1 */}
                {currentStep === 1 && (
                  <>
                    <h6 className="mb-3">Personal Details</h6>

                    <div className="row">
                      <div className="col-md-6 mb-3 ">
                        <label>First Name</label>
                        <input className="form-control" name="firstname" value={form.firstname} onChange={handleInputChange} />
                      </div>

                      <div className="col-md-6 mb-3">
                        <label>Last Name</label>
                        <input className="form-control" name="lastname" value={form.lastname} onChange={handleInputChange} />
                      </div>

                      <div className="col-md-6 mb-3">
                        <label>Email Address</label>
                        <input
                          className="form-control"
                          name="email"
                          value={form.email}
                          onChange={handleInputChange}
                          placeholder="example@email.com"
                          readOnly={!isAddMode}
                        />
                        {isAddMode && form.email?.trim() && !isValidEmail(form.email) ? (
                          <small className="text-danger">Invalid email format (remove special chars like ^)</small>
                        ) : null}
                      </div>

                      <div className="col-md-6 mb-3">
                        <label>Phone Number</label>
                        <input className="form-control" name="phonenumber" value={form.phonenumber} onChange={handleInputChange} />
                      </div>

                      <div className="col-md-6 mb-3">
                        <label>Passport (Upload)</label>
                        <div className="d-flex gap-2">
                          <input className="form-control" value={form.passportid} readOnly placeholder="Upload Passport (max 20MB)" />
                          <label className="btn btn-primary mb-0">
                            Browse
                            <input type="file" hidden onChange={(e) => uploadAndSet(e.target.files?.[0], "passportid")} />
                          </label>
                        </div>
                      </div>

                      <div className="col-md-6 mb-3">
                        <label>Driving License (Upload)</label>
                        <div className="d-flex gap-2">
                          <input className="form-control" value={form.drivinglicense} readOnly placeholder="Upload License (max 20MB)" />
                          <label className="btn btn-primary mb-0">
                            Browse
                            <input type="file" hidden onChange={(e) => uploadAndSet(e.target.files?.[0], "drivinglicense")} />
                          </label>
                        </div>
                      </div>

                      <div className="col-md-6 mb-3">
                        <label>Nationality</label>
                        <select className="form-control" name="nationalityid" value={form.nationalityid} onChange={handleInputChange}>
                          <option value="">Select Nationality</option>
                          {nationalities.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.nationality}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-md-6 mb-3">
                        <label>Date of Birth</label>
                        <input type="date" className="form-control" name="dob" value={form.dob} onChange={handleInputChange} />
                      </div>

                      <div className="col-md-6 mb-3">
                        <label>Gender</label>
                        <select className="form-control" name="gender" value={form.gender} onChange={handleInputChange}>
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    <h6 className="mt-3 mb-3">Address</h6>
                    <div className="row">
                      <div className="col-md-6 mb-3">
                        <label>Street</label>
                        <input className="form-control" name="street" value={form.street} onChange={handleInputChange} />
                      </div>
                      <div className="col-md-6 mb-3">
                        <label>Area</label>
                        <input className="form-control" name="area" value={form.area} onChange={handleInputChange} />
                      </div>
                      <div className="col-md-6 mb-3">
                        <label>City</label>
                        <input className="form-control" name="city" value={form.city} onChange={handleInputChange} />
                      </div>
                      <div className="col-md-6 mb-3">
                        <label>Postcode</label>
                        <input className="form-control" name="postcode" value={form.postcode} onChange={handleInputChange} />
                      </div>
                    </div>
                  </>
                )}

                {/* STEP 2 (MULTI) */}
                {currentStep === 2 && (
                  <>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="mb-0">Educational Details</h6>
                      <button type="button" className="btn btn-sm btn-primary" onClick={addEducationRow}>
                        Add Education
                      </button>
                    </div>

                    {educationList.map((edu, idx) => (
                      <div key={idx} className="border rounded p-2 mb-3">
                        <div className="d-flex justify-content-between align-items-center">
                          <b>Education #{idx + 1}</b>
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteEducationRow(idx)}>
                            Delete
                          </button>
                        </div>

                        <div className="row mt-2">
                          <div className="col-md-6 mb-3">
                            <label>University</label>
                            <input className="form-control" value={edu.university} onChange={(e) => updateEducation(idx, "university", e.target.value)} />
                          </div>

                          <div className="col-md-6 mb-3">
                            <label>Degree Type</label>
                            <select className="form-control" value={edu.degreeType} onChange={(e) => updateEducation(idx, "degreeType", e.target.value)}>
                              <option value="">Select Degree Type</option>
                              <option value="Associate Degree">Associate Degree</option>
                              <option value="Bachelor's Degree">Bachelor's Degree</option>
                              <option value="Master's Degree">Master's Degree</option>
                              <option value="Doctoral Degree">Doctoral Degree</option>
                              <option value="Professional Degree">Professional Degree</option>
                              <option value="Diploma">Diploma</option>
                              <option value="Certificate">Certificate</option>
                              <option value="Postgraduate Diploma">Postgraduate Diploma</option>
                              <option value="Postgraduate Certificate">Postgraduate Certificate</option>
                              <option value="Fellowship">Fellowship</option>
                            </select>
                          </div>

                          <div className="col-md-6 mb-3">
                            <label>Degree</label>
                            <input className="form-control" value={edu.degree} onChange={(e) => updateEducation(idx, "degree", e.target.value)} />
                          </div>

                          <div className="col-md-6 mb-3">
                            <label>Specialisation</label>
                            <input className="form-control" value={edu.specialisation} onChange={(e) => updateEducation(idx, "specialisation", e.target.value)} />
                          </div>

                          <div className="col-md-12 mb-3">
                            <label>Teaching Qualification Certificate</label>
                            <div className="d-flex gap-2">
                              <input className="form-control" value={edu.certificate} readOnly placeholder="Upload Document (max 20MB)" />
                              <label className="btn btn-primary mb-0">
                                Browse
                                <input type="file" hidden onChange={(e) => uploadEducationCertificate(idx, e.target.files?.[0])} />
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* STEP 3 */}
                {currentStep === 3 && (
                  <>
                    <h6 className="mb-3">Teaching Profile</h6>

                    <div className="row">
                      <div className="col-md-12 mb-3">
                        <label>Subjects</label>

                        <TreeSelect
                          className="w-100 wow-subjects"
                          value={selectedSubjectIds}
                          treeData={subjectTreeData}
                          treeCheckable
                          showSearch
                          treeNodeFilterProp="title"
                          placeholder={subjectLoading ? "Loading subjects..." : "Select Subjects"}
                          allowClear
                          maxTagCount="responsive"
                          dropdownStyle={{ maxHeight: 360, overflow: "auto" }}
                          getPopupContainer={(trigger) => trigger.parentNode}
                          onChange={(vals) => {
                            const clean = (vals || [])
                              .map(String)
                              .filter((v) => v && !v.startsWith("cat-")); // safety

                            setSelectedSubjectIds(clean);

                            setForm((p) => ({
                              ...p,
                              subjectid: clean.join(","),
                              subjects: JSON.stringify(clean),
                            }));
                          }}
                          disabled={subjectLoading || !subjectTreeNodes?.length}
                        />

                        {subjectError ? <small className="text-danger d-block mt-1">{subjectError}</small> : null}
                      </div>

                      <div className="col-md-12 mb-3">
                        <label>Introduce Yourself</label>
                        <textarea className="form-control" rows={3} name="introduceyourself" value={form.introduceyourself} onChange={handleInputChange} />
                      </div>

                      <div className="col-md-12 mb-3">
                        <label>Teaching Experience</label>
                        <input className="form-control" name="teachexp" value={form.teachexp} onChange={handleInputChange} />
                      </div>

                      <div className="col-md-12 mb-3">
                        <label>Motivate Potential Students</label>
                        <input className="form-control" name="motivate" value={form.motivate} onChange={handleInputChange} />
                      </div>

                      <div className="col-md-12 mb-3">
                        <label>Write a Catchy Headline</label>
                        <input className="form-control" name="headline" value={form.headline} onChange={handleInputChange} />
                      </div>
                    </div>
                  </>
                )}

                {/* STEP 4 */}
                {currentStep === 4 && (
                  <>
                    <h6 className="mb-2">Please add a horizontal video intro of upto 2 mins</h6>
                    <p className="mb-3">Choose one option below</p>

                    <div className="d-flex gap-2 mb-3">
                      <button
                        type="button"
                        className={`btn ${videoIntroMode === "link" ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => {
                          setVideoIntroMode("link");
                          if (localVideoPreview) {
                            URL.revokeObjectURL(localVideoPreview);
                            setLocalVideoPreview("");
                          }
                          setForm((p) => ({ ...p, videofile: "" }));
                        }}
                      >
                        YouTube Link
                      </button>

                      <button
                        type="button"
                        className={`btn ${videoIntroMode === "upload" ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => {
                          setVideoIntroMode("upload");
                          setYtVideoId("");
                          setForm((p) => ({ ...p, videolink: "" }));
                        }}
                      >
                        Upload Video (max 2 mins)
                      </button>
                    </div>

                    {videoIntroMode === "link" && (
                      <div className="mb-3">
                        <label>Video Link</label>
                        <input
                          className="form-control"
                          name="videolink"
                          value={form.videolink}
                          onChange={(e) => {
                            const val = e.target.value;
                            setForm((p) => ({ ...p, videolink: val }));
                            setYtVideoId(extractYouTubeId(val));
                          }}
                          placeholder="https://www.youtube.com/watch?v=..."
                        />

                        {form.videolink?.trim() && (
                          <div className="mt-2">
                            {ytVideoId ? (
                              <div className="border rounded overflow-hidden" style={{ aspectRatio: "16/9" }}>
                                <iframe
                                  title="YouTube Preview"
                                  src={ytEmbedUrl}
                                  style={{ width: "100%", height: "100%", border: 0 }}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            ) : (
                              <small className="text-danger">Invalid YouTube link — please paste a valid YouTube URL.</small>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {videoIntroMode === "upload" && (
                      <div className="mb-3">
                        <label>Upload Video</label>
                        <div className="d-flex gap-2">
                          <input className="form-control" value={form.videofile} readOnly placeholder="Upload video (horizontal, upto 2 mins)" />
                          <label className="btn btn-primary mb-0">
                            Browse
                            <input
                              type="file"
                              hidden
                              accept="video/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                setVideoIntroMode("upload");
                                setForm((p) => ({ ...p, videolink: "" }));
                                setYtVideoId("");

                                if (localVideoPreview) URL.revokeObjectURL(localVideoPreview);
                                const objUrl = URL.createObjectURL(file);
                                setLocalVideoPreview(objUrl);

                                await uploadAndSet(file, "videofile");
                              }}
                            />
                          </label>
                        </div>

                        {(localVideoPreview || form.videofile) && (
                          <div className="mt-2 border rounded p-2">
                            <video controls style={{ width: "100%", maxHeight: 320, borderRadius: 8 }} src={localVideoPreview || form.videofile} />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mb-3">
                      <label>1. Upload a thumbnail (optional)</label>

                      {(localThumbPreview || form.thumbnails) && (
                        <img src={localThumbPreview || form.thumbnails} alt="Thumb" className="img-fluid rounded mb-2" style={{ maxHeight: 220 }} />
                      )}

                      <div className="d-flex gap-2">
                        <input className="form-control" value={form.thumbnails} readOnly placeholder="Upload thumbnail" />
                        <label className="btn btn-primary mb-0">
                          Browse
                          <input
                            type="file"
                            hidden
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;

                              if (localThumbPreview) URL.revokeObjectURL(localThumbPreview);
                              const objUrl = URL.createObjectURL(file);
                              setLocalThumbPreview(objUrl);

                              await uploadAndSet(file, "thumbnails");
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="mb-3">
                      <label>2. Write a short description (optional)</label>
                      <textarea className="form-control" rows={3} name="videodesc" value={form.videodesc} onChange={handleInputChange} />
                    </div>
                  </>
                )}

                {/* STEP 5 */}
                {currentStep === 5 && (
                  <>
                    <h6 className="mb-3">Availability</h6>

                    <div className="alert alert-info text-center">
                      <strong>Current Time zone of Teacher</strong>
                      <div className="mt-2">
                        <b>{availability.timezone}</b>
                      </div>
                    </div>

                    <div className="mb-3">
                      <label>Timezone</label>
                      <select
                        className="form-control"
                        value={availability.timezone}
                        onChange={(e) =>
                          setAvailability((p) => ({
                            ...p,
                            timezone: e.target.value,
                            tzConfirmed: false,
                          }))
                        }
                      >
                        {!timezones?.length ? (
                          <option value="">Loading timezones...</option>
                        ) : (
                          timezones.map((t) => (
                            <option key={t.id} value={t.timezone}>
                              {t.timezone}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">2. Set Your Availability</h6>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => addSlot("normal")}>
                        Add Slot
                      </button>
                    </div>

                    {availability.slots.map((s, idx) => (
                      <div key={idx} className="border rounded p-2 mt-2">
                        <div className="row g-2 align-items-end">
                          <div className="col-md-4">
                            <label className="small">Day</label>
                            <select className="form-control" value={s.day} onChange={(e) => updateSlot("normal", idx, "day", e.target.value)}>
                              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-md-3">
                            <label className="small">Time From</label>
                            <input
                              type="time"
                              className="form-control"
                              value={s.from}
                              onChange={(e) => updateSlot("normal", idx, "from", e.target.value)}
                            />
                          </div>

                          <div className="col-md-3">
                            <label className="small">Time To</label>
                            <input className="form-control" value={prettyTime(s.to) || ""} disabled readOnly />
                          </div>

                          <div className="col-md-2 d-grid">
                            <button type="button" className="btn btn-outline-danger" onClick={() => deleteSlot("normal", idx)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <hr className="my-4" />

                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">3. Set Your Group Session Availability</h6>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => addSlot("group")}>
                        Add Slot
                      </button>
                    </div>

                    {availability.groupSlots.map((s, idx) => (
                      <div key={idx} className="border rounded p-2 mt-2">
                        <div className="row g-2 align-items-end">
                          <div className="col-md-3">
                            <label className="small">Day</label>
                            <select className="form-control" value={s.day} onChange={(e) => updateSlot("group", idx, "day", e.target.value)}>
                              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-md-3">
                            <label className="small">Time From</label>
                            <input
                              type="time"
                              className="form-control"
                              value={s.from}
                              onChange={(e) => updateSlot("group", idx, "from", e.target.value)}
                            />
                          </div>

                          <div className="col-md-3">
                            <label className="small">Time To</label>
                            <input className="form-control" value={prettyTime(s.to) || ""} disabled readOnly />
                          </div>

                          <div className="col-md-1">
                            <label className="small">Participants</label>
                            <select
                              className="form-control"
                              value={Number(s.participants || 2)}
                              onChange={(e) => updateSlot("group", idx, "participants", Number(e.target.value))}
                            >
                              {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-md-2 d-grid">
                            <button type="button" className="btn btn-outline-danger" onClick={() => deleteSlot("group", idx)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          <div className="modal-footer d-flex justify-content-between">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>

            <div className="d-flex gap-2">
              {currentStep > 1 && (
                <button type="button" className="btn btn-outline-secondary" onClick={prevStep} disabled={saving}>
                  Back
                </button>
              )}

              {currentStep < totalSteps ? (
                <button type="button" className="btn btn-primary" onClick={nextStep} disabled={saving}>
                  Save & Next
                </button>
              ) : (
                <button type="button" className="btn btn-success" onClick={handleFinalSubmit} disabled={saving}>
                  {saving ? "Submitting..." : "Submit"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherDetailsModal;
