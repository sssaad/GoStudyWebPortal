import React, { useEffect, useState } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Link, NavLink, useLocation } from "react-router-dom";
import ThemeToggleButton from "../helper/ThemeToggleButton";
import { getTeacherProfile } from "../api/getTeacherProfile";
import Swal from "sweetalert2";

const MasterLayout = ({ children }) => {
  const [sidebarActive, seSidebarActive] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openMenu, setOpenMenu] = useState("");
  const location = useLocation();

  const [teacherName, setTeacherName] = useState("User");
  const [teacherImage, setTeacherImage] = useState("assets/images/user.png");

  const menuGroups = {
    users: [
      "/students-list",
      "/teachers-list",
      "/parents-list",
      "/registration-requests",
      "/group-class-enquiries",
      "/leads-centre",
    ],
    academics: [
      "/subject",
      "/group-live-sessions",
      "/session-feedbacks",
      "/teacher-reviews",
    ],
    bookings: [
      "/bookings",
      "/group-bookings",
      "/direct-bookings",
      "/inperson-bookings",
    ],
    payments: [
      "/subscription",
      "/block-subscription",
      // "/group-payments",
      "/promocodes",
      "/invoice-list",
      "/teacher-payouts",
      // "/payments",
    ],
    communication: [
      "/email",
      "/todo-list",
    ],
    settings: [
      "/setting",
    ],
  };

  useEffect(() => {
    const fetchTeacherData = async () => {
      const teacherId = localStorage.getItem("teacherid");

      if (teacherId) {
        const data = await getTeacherProfile(teacherId);

        if (data) {
          const fullName = `${data.firstname || ""} ${data.lastname || ""}`.trim();
          const image = data.imagepath?.trim() || "assets/images/user.png";

          setTeacherName(fullName || "User");
          setTeacherImage(image);
        }
      }
    };

    fetchTeacherData();
  }, []);

  // ✅ Reload site after every 5 minutes
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     window.location.reload();
  //   }, 300000); // 5 minutes

  //   return () => clearInterval(interval);
  // }, []);

  useEffect(() => {
    const currentPath = location.pathname;

    const activeGroup = Object.keys(menuGroups).find((groupKey) =>
      menuGroups[groupKey].includes(currentPath)
    );

    if (activeGroup) {
      setOpenMenu(activeGroup);
    }
  }, [location.pathname]);

  const sidebarControl = () => seSidebarActive(!sidebarActive);
  const mobileMenuControl = () => setMobileMenu(!mobileMenu);

  const toggleMenu = (menuKey) => {
    setOpenMenu((prev) => (prev === menuKey ? "" : menuKey));
  };

  const isMenuOpen = (menuKey) => openMenu === menuKey;

  const getParentClass = (menuKey) => {
    return isMenuOpen(menuKey)
      ? "sidebar-parent-link active-parent"
      : "sidebar-parent-link";
  };

  const getSubmenuStyle = (menuKey) => ({
    maxHeight: isMenuOpen(menuKey) ? "700px" : "0px",
    overflow: "hidden",
    transition: "max-height 0.28s ease",
  });

  const childNavClass = ({ isActive }) => {
    return isActive ? "sidebar-child-link active-child" : "sidebar-child-link";
  };

  const handleLogout = () => {
    Swal.fire({
      icon: "success",
      title: "Logged Out",
      text: "You have been successfully logged out.",
      timer: 1500,
      showConfirmButton: false,
      position: "center",
      timerProgressBar: true,
      willClose: () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/";
      },
    });
  };

  const ParentMenu = ({ menuKey, icon, title, children }) => {
    const opened = isMenuOpen(menuKey);

    return (
      <li className={opened ? "sidebar-accordion-item open" : "sidebar-accordion-item"}>
        <button
          type="button"
          className={getParentClass(menuKey)}
          onClick={() => toggleMenu(menuKey)}
        >
          <span className="sidebar-parent-left">
            <Icon icon={icon} className="menu-icon" />
            <span>{title}</span>
          </span>

          <Icon
            icon="iconamoon:arrow-down-2"
            className={opened ? "sidebar-arrow rotate" : "sidebar-arrow"}
          />
        </button>

        <ul className="sidebar-submenu custom-sidebar-submenu" style={getSubmenuStyle(menuKey)}>
          {children}
        </ul>
      </li>
    );
  };

  const ChildMenu = ({ to, label, dotClass = "" }) => {
    return (
      <li>
        <NavLink to={to} className={childNavClass}>
          <span className={`sidebar-child-dot ${dotClass}`} />
          <span>{label}</span>
        </NavLink>
      </li>
    );
  };

  return (
    <section className={mobileMenu ? "overlay active" : "overlay"}>
      <style>
        {`
          .sidebar-accordion-item {
            list-style: none;
            margin-bottom: 4px;
          }

          .sidebar-parent-link {
            width: 100%;
            border: 0;
            outline: none;
            background: transparent;
            color: inherit;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 12px 16px;
            border-radius: 8px;
            transition: 0.22s ease;
            font-weight: 600;
            text-align: left;
          }

          .sidebar-parent-link:hover {
            background: rgba(72, 127, 255, 0.12);
          }

          .sidebar-parent-link.active-parent {
            background: #487FFF;
            color: #ffffff;
          }

          .sidebar-parent-link.active-parent .menu-icon,
          .sidebar-parent-link.active-parent .sidebar-arrow {
            color: #ffffff;
          }

          .sidebar-parent-left {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
          }

          .sidebar-parent-left span:last-child {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .sidebar-arrow {
            font-size: 18px;
            transition: transform 0.22s ease;
            flex-shrink: 0;
          }

          .sidebar-arrow.rotate {
            transform: rotate(180deg);
          }

          .custom-sidebar-submenu {
            padding-left: 44px !important;
            margin-top: 8px !important;
            margin-bottom: 6px !important;
          }

          .custom-sidebar-submenu li {
            list-style: none;
            margin-bottom: 4px;
          }

          .sidebar-child-link {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 9px 12px;
            border-radius: 8px;
            font-weight: 500;
            color: inherit;
            text-decoration: none;
            transition: 0.22s ease;
          }

          .sidebar-child-link:hover {
            background: rgba(72, 127, 255, 0.10);
          }

          .sidebar-child-link.active-child {
            background: rgba(72, 127, 255, 0.14);
            color: inherit;
          }

          .sidebar-child-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
            background: #487FFF;
            flex-shrink: 0;
          }

          .sidebar-child-dot.orange-dot {
            background: #F98C08;
          }

          .sidebar-child-dot.blue-dot {
            background: #2563EB;
          }

          .sidebar-child-dot.red-dot {
            background: #F04438;
          }

          .sidebar-child-dot.green-dot {
            background: #22C55E;
          }

          .sidebar.active .sidebar-parent-link {
            justify-content: center;
            padding-left: 10px;
            padding-right: 10px;
          }

          .sidebar.active .sidebar-parent-left span:last-child,
          .sidebar.active .sidebar-arrow,
          .sidebar.active .custom-sidebar-submenu {
            display: none !important;
          }

          .sidebar.active .sidebar-parent-left {
            gap: 0;
          }
        `}
      </style>

      <aside
        className={
          sidebarActive
            ? "sidebar active"
            : mobileMenu
              ? "sidebar sidebar-open"
              : "sidebar"
        }
      >
        <button onClick={mobileMenuControl} type="button" className="sidebar-close-btn">
          <Icon icon="radix-icons:cross-2" />
        </button>

        <div>
          <Link to="/" className="sidebar-logo">
            <img src="assets/images/logo.png" alt="site logo" className="light-logo" />
            <img src="assets/images/logo-light.png" alt="site logo" className="dark-logo" />
            <img src="assets/images/logo-icon.png" alt="site logo" className="logo-icon" />
          </Link>
        </div>

        <div className="sidebar-menu-area">
          <ul className="sidebar-menu" id="sidebar-menu">
            <li>
              <NavLink to="/index" className={({ isActive }) => (isActive ? "active-page" : "")}>
                <Icon icon="solar:home-smile-angle-outline" className="menu-icon" />
                <span>Dashboard</span>
              </NavLink>
            </li>

            <li className="sidebar-menu-group-title">Application</li>

            <ParentMenu
              menuKey="users"
              icon="mdi:account-group-outline"
              title="Users"
            >
              <ChildMenu to="/students-list" label="Students" dotClass="blue-dot" />
              <ChildMenu to="/teachers-list" label="Teachers" dotClass="orange-dot" />
              <ChildMenu to="/parents-list" label="Parents" dotClass="green-dot" />
              <ChildMenu to="/registration-requests" label="Registration Requests" dotClass="red-dot" />
              <ChildMenu to="/group-class-enquiries" label="Group Enquiries" dotClass="orange-dot" />
              <ChildMenu to="/leads-centre" label="Leads Centre" dotClass="blue-dot" />
            </ParentMenu>

            <ParentMenu
              menuKey="academics"
              icon="mdi:school-outline"
              title="Academics"
            >
              <ChildMenu to="/subject" label="Subjects" dotClass="blue-dot" />
              <ChildMenu to="/group-live-sessions" label="Live Group Sessions" dotClass="orange-dot" />
              <ChildMenu to="/session-feedbacks" label="Performance Feedbacks" dotClass="green-dot" />
              <ChildMenu to="/teacher-reviews" label="Teacher Reviews" dotClass="red-dot" />
            </ParentMenu>

            <ParentMenu
              menuKey="bookings"
              icon="material-symbols:calendar-month-outline"
              title="Bookings"
            >
              <ChildMenu to="/bookings" label="All Bookings" dotClass="blue-dot" />
              <ChildMenu to="/group-bookings" label="Group Bookings" dotClass="red-dot" />
              <ChildMenu to="/direct-bookings" label="Direct Bookings" dotClass="orange-dot" />
              <ChildMenu to="/inperson-bookings" label="In-Person Bookings" dotClass="green-dot" />
            </ParentMenu>

            <ParentMenu
              menuKey="payments"
              icon="mdi:cash-multiple"
              title="Payments"
            >
              <ChildMenu to="/subscription" label="Subscriptions" dotClass="blue-dot" />
              <ChildMenu to="/block-subscription" label="Block Subscriptions" dotClass="orange-dot" />
              {/* <ChildMenu to="/group-payments" label="Group Payments" dotClass="orange-dot" /> */}
              <ChildMenu to="/promocodes" label="Promo Codes" dotClass="green-dot" />

              {/* <li>
                <NavLink to="/payments" className={({ isActive }) => (isActive ? "active-page" : "")}>
                  <Icon icon="mdi:credit-card-outline" className="menu-icon" />
                  <span>Payments</span>
                </NavLink>
              </li> */}

              <ChildMenu to="/invoice-list" label="Invoices" dotClass="red-dot" />
              <ChildMenu to="/teacher-payouts" label="Teacher Payouts" dotClass="blue-dot" />
            </ParentMenu>

            <ParentMenu
              menuKey="communication"
              icon="mdi:email-outline"
              title="Communication"
            >
              <ChildMenu
                to="/email"
                label="Confirmation Emails"
                dotClass="blue-dot"
              />

              <ChildMenu
                to="/todo-list"
                label="To Do List"
                dotClass="green-dot"
              />
            </ParentMenu>

            <ParentMenu
              menuKey="settings"
              icon="icon-park-outline:setting-two"
              title="Settings"
            >
              <ChildMenu to="/setting" label="Settings" dotClass="blue-dot" />
            </ParentMenu>
          </ul>
        </div>
      </aside>

      <main className={sidebarActive ? "dashboard-main active" : "dashboard-main"}>
        <div className="navbar-header">
          <div className="row align-items-center justify-content-between">
            <div className="col-auto">
              <div className="d-flex flex-wrap align-items-center gap-4">
                <button type="button" className="sidebar-toggle" onClick={sidebarControl}>
                  {sidebarActive ? (
                    <Icon icon="iconoir:arrow-right" className="icon text-2xl non-active" />
                  ) : (
                    <Icon icon="heroicons:bars-3-solid" className="icon text-2xl non-active" />
                  )}
                </button>

                <button onClick={mobileMenuControl} type="button" className="sidebar-mobile-toggle">
                  <Icon icon="heroicons:bars-3-solid" className="icon" />
                </button>
              </div>
            </div>

            <div className="col-auto">
              <div className="d-flex flex-wrap align-items-center gap-3">
                <ThemeToggleButton />

                <div className="dropdown">
                  <button
                    className="d-flex justify-content-center align-items-center rounded-circle"
                    type="button"
                    data-bs-toggle="dropdown"
                  >
                    <img
                      src={teacherImage}
                      onError={(e) => (e.target.src = "assets/images/user.png")}
                      alt="image_user"
                      className="w-40-px h-40-px object-fit-cover rounded-circle"
                    />
                  </button>

                  <div className="dropdown-menu to-top dropdown-menu-sm">
                    <div className="py-12 px-16 radius-8 bg-primary-50 mb-16 d-flex align-items-center justify-content-between gap-2">
                      <div>
                        <h6 className="text-lg text-primary-light fw-semibold mb-2">
                          {teacherName}
                        </h6>
                        <span className="text-secondary-light fw-medium text-sm">Admin</span>
                      </div>

                      <button type="button" className="hover-text-danger">
                        <Icon icon="radix-icons:cross-1" className="icon text-xl" />
                      </button>
                    </div>

                    <ul className="to-top-list">
                      <li>
                        <Link
                          className="dropdown-item text-black px-0 py-8 hover-bg-transparent hover-text-primary d-flex align-items-center gap-3"
                          to="/setting"
                        >
                          <Icon icon="solar:user-linear" className="icon text-xl" /> My Profile
                        </Link>
                      </li>

                      <li>
                        <button
                          onClick={handleLogout}
                          className="dropdown-item text-black px-0 py-8 hover-bg-transparent hover-text-danger d-flex align-items-center gap-3 bg-transparent border-0 w-100 text-start"
                        >
                          <Icon icon="lucide:power" className="icon text-xl" /> Log Out
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-main-body">{children}</div>

        <footer className="d-footer">
          <div className="row align-items-center justify-content-between">
            <div className="col-auto">
              <p className="mb-0">© 2025 Gostudy.ae All Rights Reserved.</p>
            </div>

            <div className="col-auto">
              <p className="mb-0">
                Made by <span className="text-primary-600">GoStudy.ae</span>
              </p>
            </div>
          </div>
        </footer>
      </main>
    </section>
  );
};

export default MasterLayout;