// src/components/StudentDetailsModal.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import moment from "moment";
import axios from "axios";
import Swal from "sweetalert2";
import { getNationalities } from "../api/getNationalities";
import { getToken } from "../api/getToken";
import { uploadFileAws } from "../api/uploadFileAws";
import { getTimezonesLookup } from "../api/getTimezonesLookup";


const headers = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
};

const DEFAULT_AVATAR =
  "https://lylassets.s3.eu-north-1.amazonaws.com/uploads/person-dummy.jpg";

const FETCH_PROFILE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=teacher_profile";
const UPDATE_PROFILE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=update_user_profile";
const ADD_PROFILE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=add_user_profile";
const PRICING_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=get_pricing";

// ---- Helpers ----
function splitName(fullname = "") {
  const clean = String(fullname || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstname: "", lastname: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstname: parts[0], lastname: "" };
  return { firstname: parts[0], lastname: parts.slice(1).join(" ") };
}
const toNumberOrEmpty = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
};

// Pricing → Years list
async function fetchClassOptions() {
  const res = await fetch(PRICING_URL, { method: "GET", headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.statusCode !== 200 || !Array.isArray(json.data)) {
    throw new Error(json.message || "Unexpected pricing response");
  }
  const years = json.data
    .filter((r) => Number(r.is_deleted) === 0)
    .map((r) => Number(r.Year))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  return years.map((n) => ({ value: String(n), label: `Year ${n}` }));
}

// Curriculum options
const CURRICULA = [
  { value: "British Curriculum (e.g., GCSE, A Levels)", label: "British Curriculum (e.g., GCSE, A Levels)" },
  { value: "American Curriculum", label: "American Curriculum" },
  { value: "IB (International Baccalaureate)", label: "IB (International Baccalaureate)" },
  { value: "Indian Curriculum (CBSE/ICSE)", label: "Indian Curriculum (CBSE/ICSE)" },
  { value: "UAE Ministry of Education Curriculum", label: "UAE Ministry of Education Curriculum" },
  { value: "__other__", label: "Other (please specify)" },
];

const StudentDetailsModal = ({ show, onClose, userid, seed, onSave }) => {
  const [formData, setFormData] = useState({ active: "1" });
  const [educationData, setEducationData] = useState([]); // single row only
  const [nationalities, setNationalities] = useState([]);
  const [classOptions, setClassOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Prevent multiple API calls from rapid/double clicks
  const saveRequestLock = useRef(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [timezones, setTimezones] = useState([]);
  const [studentTzName, setStudentTzName] = useState(""); // dropdown value (string like Europe/London)


  const isAddMode = userid == null;
  const seedUserId = seed?.id;

  // Load class options (Year list)
  useEffect(() => {
    (async () => {
      try {
        const opts = await fetchClassOptions();
        setClassOptions(opts);
      } catch (e) {
        console.error("get_pricing failed", e);
        setClassOptions([]);
      }
    })();
  }, []);

  // Load nationalities
  useEffect(() => {
    (async () => {
      try {
        const res = await getNationalities();
        setNationalities(res || []);
      } catch (e) {
        console.error("getNationalities error", e);
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

  // Fetch / Prefill
  useEffect(() => {
    if (!show) return;

    if (isAddMode) {
      const { firstname, lastname } = splitName(seed?.fullname);
      setFormData({
        active: "1",
        userid: seedUserId,
        firstname,
        lastname,
        email: seed?.email || "",
        parentemail: seed?.parentemail || "",
        phonenumber: seed?.phonenumber || "",
        nationalityid: "",
        gender: "",
        dob: "",
        street: "",
        area: "",
        city: "",
        postcode: "",
        imagepath: "",
        timezoneid: "",
      });
      setStudentTzName("");
      setSelectedImage(null);
      setEducationData([
        {
          id: undefined,
          userid: seedUserId,
          university: "",
          degree: "", // UI stores "1".."13"
          specialization: "", // curriculum
          otherSpecialization: "",
          startdate: "",
          enddate: "",
        },
      ]);
      return;
    }

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
        if (res.data.statusCode === 200) {
          const profile = res.data.data.profile?.[0] || {};
          const education = res.data.data.educationdeails || [];
          const natId = profile.nationalityid ?? profile.nationality ?? "";
          setFormData({
            ...profile,
            active: profile.active || "1",
            nationalityid: toNumberOrEmpty(natId),
            gender: profile.gender || "",
            parentemail: profile.parentemail || "",
            timezoneid: String(profile.timezoneid ?? ""),
          });
          setSelectedImage(profile.imagepath || null);

          const tzId = profile.timezoneid ?? "";
          const tzName =
            (timezones || []).find((t) => String(t.id) === String(tzId))?.timezone || "";

          setStudentTzName(tzName);

          const first = Array.isArray(education) && education.length > 0 ? education[0] : {};
          const deg = Number(first.degree);
          setEducationData([
            {
              id: first.id,
              userid: first.userid || userid,
              university: first.university || "",
              degree: Number.isFinite(deg) ? String(deg) : "",
              specialization: first.specialization || "",
              otherSpecialization: first.otherSpecialization || "",
              startdate: first.startdate || "",
              enddate: first.enddate || "",
            },
          ]);
        } else {
          Swal.fire("Error", res.data.message || "Failed to load profile", "error");
        }
      } catch (e) {
        console.error("fetch student error", e);
        Swal.fire("Error", "Failed to load profile", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [show, userid, isAddMode, seedUserId, seed, timezones]);

  if (!show) return null;

  // ---- Handlers ----
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "nationalityid") {
      setFormData((p) => ({ ...p, nationalityid: toNumberOrEmpty(value) }));
      return;
    }
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const handleEducationChange = (field, value) => {
    setEducationData((prev) => {
      const row =
        prev[0] || {
          id: undefined,
          userid: formData.userid || seedUserId,
          university: "",
          degree: "",
          specialization: "",
          otherSpecialization: "",
          startdate: "",
          enddate: "",
        };
      return [{ ...row, [field]: value }];
    });
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const uploadedPath = await uploadFileAws(file);
      if (uploadedPath) {
        setSelectedImage(URL.createObjectURL(file));
        setFormData((p) => ({ ...p, imagepath: uploadedPath }));
        Swal.fire("Uploaded!", "Image uploaded successfully.", "success");
      } else {
        Swal.fire("Upload Failed", "Image could not be uploaded.", "error");
      }
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Something went wrong during upload.", "error");
    } finally {
      setLoading(false);
    }
  };

  // ---- Validation ----
  const validateAdd = () => {
    if (!formData.userid) return "Missing userid";
    if (!formData.firstname) return "First name is required";
    if (!formData.email) return "Email is required";
    if (!Number.isFinite(Number(formData.nationalityid)))
      return "Please select a nationality";
    return null;
  };

  // ---- Save ----
  const handleSave = async () => {
    const eduRow = educationData[0] || {
      university: "",
      degree: "",
      specialization: "",
      otherSpecialization: "",
      startdate: "",
      enddate: "",
    };

    // SEND degree as NUMBER
    const degreeNumber = Number(eduRow.degree) || 0;

    // Normalize specialization if "Other"
    const specToSend =
      eduRow.specialization === "__other__"
        ? (eduRow.otherSpecialization || "")
        : (eduRow.specialization || "");

    if (isAddMode) {
      const v = validateAdd();

      if (v) {
        return Swal.fire("Validation", v, "warning");
      }

      // API request already processing ho to dobara request na bhejo
      if (saveRequestLock.current) {
        return;
      }

      saveRequestLock.current = true;
      setSaving(true);

      try {
        const token = await getToken();
        if (!token) throw new Error("Token not found");

        const body = {
          token,
          userdetail: [
            {
              userid: Number(formData.userid || seedUserId),
              firstname: formData.firstname || "",
              lastname: formData.lastname || "",
              email: formData.email || "",
              parentemail: formData.parentemail || "",
              phonenumber: formData.phonenumber || "",
              nationality: String(Number(formData.nationalityid)), // API expects "nationality"
              gender: formData.gender || "",
              dob: formData.dob || "",
              street: formData.street || "",
              area: formData.area || "",
              city: formData.city || "",
              postcode: formData.postcode || "",
              imagepath: formData.imagepath || "",
              timezoneid: String(formData.timezoneid || ""),
            },
          ],
          educationdetails: [
            {
              userid: Number(formData.userid || seedUserId),
              university: eduRow.university || "",
              degree: degreeNumber, // number
              specialization: specToSend,
              otherSpecialization:
                eduRow.specialization === "__other__" ? (eduRow.otherSpecialization || "") : "",
              startdate: eduRow.startdate || "",
              enddate: eduRow.enddate || "",
            },
          ],
        };

        const res = await axios.post(ADD_PROFILE_URL, body, { headers });
        const ok = res?.data?.statusCode === 200 || res?.data?.success;
        if (ok) {
          await Swal.fire({
            icon: "success",
            title: "Student details added!",
            text: "Student profile has been added successfully.",
            timer: 1500,
            showConfirmButton: false,
            allowOutsideClick: false,
            allowEscapeKey: false,
          });

          // Reload the page so the updated student status/list is fetched again
          window.location.reload();
        } else {
          Swal.fire({
            icon: "error",
            title: "Failed",
            text: res?.data?.message || "❌ Unknown error occurred",
          });
        }
      } catch (e) {
        console.error("add_user_profile error", e);
        Swal.fire("Error", "❌ Error adding student details", "error");
      } finally {
        saveRequestLock.current = false;
        setSaving(false);
      }
      return;
    }

    // EDIT MODE

    // API request already processing ho to dobara request na bhejo
    if (saveRequestLock.current) {
      return;
    }

    saveRequestLock.current = true;
    setSaving(true);

    try {
      const token = await getToken();
      if (!token) throw new Error("Token not found");

      const body = {
        token,
        userdetail: [
          {
            id: formData.id,
            userid: formData.userid,
            firstname: formData.firstname,
            lastname: formData.lastname,
            email: formData.email, // read-only in UI, but send back
            parentemail: formData.parentemail,
            phonenumber: formData.phonenumber,
            nationality: Number(formData.nationalityid),
            gender: formData.gender || "",
            dob: formData.dob,
            street: formData.street,
            area: formData.area,
            city: formData.city,
            postcode: formData.postcode,
            imagepath: formData.imagepath || "",
            timezoneid: String(formData.timezoneid || ""),
          },
        ],
        educationdetails: [
          {
            id: educationData[0]?.id,
            userid: educationData[0]?.userid || formData.userid,
            university: eduRow.university || "",
            degree: degreeNumber, // number
            specialization: specToSend,
          },
        ],
      };

      const res = await axios.post(UPDATE_PROFILE_URL, body, { headers });
      const ok = res?.data?.statusCode === 200 || res?.data?.success;
      if (ok) {
        Swal.fire({
          icon: "success",
          title: "Student profile updated!",
          timer: 1600,
          showConfirmButton: false,
        });
        onSave?.({
          ...formData,
          educationData: [{ ...eduRow, degree: degreeNumber, specialization: specToSend }],
        });
        onClose();
      } else {
        Swal.fire({
          icon: "error",
          title: "Update failed",
          text: res?.data?.message || "❌ Unknown error occurred",
        });
      }
    } catch (e) {
      console.error("update_user_profile error", e);
      Swal.fire("Error", "❌ Error updating student profile", "error");
    } finally {
      saveRequestLock.current = false;
      setSaving(false);
    }
  };

  // ---- Derived for UI ----
  const edu = educationData[0] || {
    id: undefined,
    userid: formData.userid || seedUserId,
    university: "",
    degree: "",
    specialization: "",
    otherSpecialization: "",
    startdate: "",
    enddate: "",
  };

  // Curriculum select value: default placeholder when empty
  const currSelectValue = !edu.specialization
    ? ""
    : (CURRICULA.some((c) => c.value === edu.specialization) ? edu.specialization : "__other__");

  return (
    <div className="modal fade show d-block" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content radius-12">
          <div className="modal-header border-secondary">
            <h5 className="modal-title">
              {isAddMode ? "Add Student Details" : "Edit Student Details"}
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-body">
            {loading ? (
              <p>Loading...</p>
            ) : (
              <>
                <div className="text-center mb-4">
                  <img
                    src={selectedImage || formData.imagepath || DEFAULT_AVATAR}
                    onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                    alt="Student"
                    className="img-thumbnail rounded mb-3"
                    style={{
                      width: "150px",
                      height: "150px",
                      objectFit: "cover",
                      borderRadius: "12px",
                      border: "2px solid #3f413fff",
                    }}
                  />
                  <div>
                    <label
                      htmlFor="studentImage"
                      className="btn btn-outline-primary d-inline-flex align-items-center justify-content-center gap-2"
                      style={{ padding: "6px 16px", fontSize: "0.9rem", borderRadius: "6px", cursor: "pointer", fontWeight: "500" }}
                    >
                      <i className="bi bi-camera" style={{ fontSize: "1rem" }}></i>
                      Upload Profile Image
                    </label>
                    <input type="file" id="studentImage" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
                  </div>

                  {!isAddMode && (
                    <>
                      <h5 className="mt-3">{`${formData.firstname || ""} ${formData.lastname || ""}`}</h5>
                      <p className="mb-1">
                        Status:{" "}
                        <span className={`badge ${String(formData.active) === "1" ? "bg-success" : "bg-danger"}`}>
                          {String(formData.active) === "1" ? "Active" : "Inactive"}
                        </span>
                      </p>
                      <p className="mb-1">
                        Joined: {formData.createddate ? moment(formData.createddate).format("DD MMM YYYY") : "N/A"}
                      </p>
                    </>
                  )}
                </div>

                {/* Form fields */}
                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label">First Name</label>
                    <input type="text" name="firstname" value={formData.firstname || ""} onChange={handleChange} className="form-control" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Last Name</label>
                    <input type="text" name="lastname" value={formData.lastname || ""} onChange={handleChange} className="form-control" />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email || ""}
                      readOnly={!isAddMode} // Edit: readonly, Add: editable
                      onChange={handleChange}
                      className="form-control"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Parent Email</label>
                    <input
                      type="email"
                      name="parentemail"
                      value={formData.parentemail || ""}
                      onChange={handleChange} // editable both modes
                      className="form-control"
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Parent Phone Number</label>
                    <input type="text" name="phonenumber" value={formData.phonenumber || ""} onChange={handleChange} className="form-control" />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Nationality</label>
                    <select
                      className="form-control"
                      name="nationalityid"
                      value={formData.nationalityid === "" ? "" : String(formData.nationalityid)}
                      onChange={handleChange}
                    >
                      <option value="">Select Nationality</option>
                      {nationalities.map((n) => (
                        <option key={n.id} value={Number(n.id)}>
                          {n.nationality}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Gender</label>
                    <select className="form-control" name="gender" value={formData.gender || ""} onChange={handleChange}>
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Date of Birth</label>
                    <input type="date" name="dob" value={formData.dob || ""} onChange={handleChange} className="form-control" />
                  </div>

                  {/* Timezone (between Address and Education) */}
                  <div className="col-12 mt-3">
                    <div className="alert alert-info text-center">
                      <strong>{isAddMode ? "Time zone of Student" : "Current Time zone of Student"}</strong>
                      <div className="mt-2">
                        <b>{isAddMode ? (studentTzName || "Please select time zone") : (studentTzName || "—")}</b>
                      </div>
                    </div>

                    <label className="form-label">Timezone</label>
                    <select
                      className="form-control"
                      value={studentTzName}
                      onChange={(e) => {
                        const name = e.target.value;
                        setStudentTzName(name);

                        const tzId = (timezones || []).find((t) => t.timezone === name)?.id ?? "";
                        setFormData((p) => ({ ...p, timezoneid: tzId }));
                      }}
                    >
                      <option value="">{isAddMode ? "Please select time zone" : "Select Timezone"}</option>
                      {timezones.map((t) => (
                        <option key={t.id} value={t.timezone}>
                          {t.timezone}
                        </option>
                      ))}
                    </select>
                  </div>


                  {/* Address */}
                  <div className="col-12 mt-3">
                    <h6>Address</h6>
                    <div className="row g-2">
                      <div className="col-md-6">
                        <input type="text" name="street" placeholder="Street" value={formData.street || ""} onChange={handleChange} className="form-control" />
                      </div>
                      <div className="col-md-6">
                        <input type="text" name="area" placeholder="Area" value={formData.area || ""} onChange={handleChange} className="form-control" />
                      </div>
                      <div className="col-md-6">
                        <input type="text" name="city" placeholder="City" value={formData.city || ""} onChange={handleChange} className="form-control" />
                      </div>
                      <div className="col-md-6">
                        <input type="text" name="postcode" placeholder="Postcode" value={formData.postcode || ""} onChange={handleChange} className="form-control" />
                      </div>
                    </div>
                  </div>

                  {/* Education (single row) */}
                  <div className="col-12 mt-3">
                    <h6>Education Details</h6>
                    <div className="row g-2">
                      <div className="col-md-4">
                        <input
                          type="text"
                          placeholder="School Name"
                          value={edu.university || ""}
                          onChange={(e) => handleEducationChange("university", e.target.value)}
                          className="form-control"
                        />
                      </div>

                      {/* Class: Year dropdown (values "1".."13"; sent as number) */}
                      <div className="col-md-4">
                        <select
                          className="form-control"
                          value={edu.degree || ""}
                          onChange={(e) => handleEducationChange("degree", e.target.value)}
                        >
                          <option value="">Select Class</option>
                          {classOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Curriculum */}
                      <div className="col-md-4">
                        <select
                          className="form-control"
                          value={currSelectValue}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "") {
                              handleEducationChange("specialization", "");
                              handleEducationChange("otherSpecialization", "");
                            } else if (v === "__other__") {
                              handleEducationChange("specialization", "__other__");
                              // keep otherSpecialization as user types below
                            } else {
                              handleEducationChange("specialization", v);
                              handleEducationChange("otherSpecialization", "");
                            }
                          }}
                        >
                          <option value="">Select Curriculum</option>
                          {CURRICULA.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Show “Other (please specify)” textbox when needed */}
                      {currSelectValue === "__other__" && (
                        <div className="col-md-12">
                          <input
                            type="text"
                            placeholder="Please specify curriculum"
                            value={edu.otherSpecialization || ""}
                            onChange={(e) => handleEducationChange("otherSpecialization", e.target.value)}
                            className="form-control"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving || loading}
            >
              Close
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  {isAddMode ? "Adding Details..." : "Saving Changes..."}
                </>
              ) : (
                isAddMode ? "Add Details" : "Save Changes"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDetailsModal;
