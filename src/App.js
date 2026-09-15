import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./assets/css/alert.css";
import ProtectedRoute from "./components/ProtectedRoute";
import GuestRoute from "./components/GuestRoute";
import RouteScrollToTop from "./helper/RouteScrollToTop";
import "antd/dist/reset.css";

// Public Pages
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import ErrorPage from "./pages/ErrorPage";

// Dashboard/Home Page
import HomePageSix from "./pages/HomePageSix";

// All Other Pages
import EmailPage from "./pages/EmailPage";
import GroupBookingPage from "./pages/GroupBookingPage.jsx";
import FeedbackPage from "./pages/FeedbackPage";
import StudentfeedbackPage from "./pages/StudentfeedbackPage";
import AddUserPage from "./pages/AddUserPage";
import AlertPage from "./pages/AlertPage";
import AssignRolePage from "./pages/AssignRolePage";
import AvatarPage from "./pages/AvatarPage";
import BadgesPage from "./pages/BadgesPage";
import ButtonPage from "./pages/ButtonPage";
import CalendarMainPage from "./pages/CalendarMainPage";
import CardPage from "./pages/CardPage";
import CarouselPage from "./pages/CarouselPage";
import ChatEmptyPage from "./pages/ChatEmptyPage";
import ChatMessagePage from "./pages/ChatMessagePage";
import ChatProfilePage from "./pages/ChatProfilePage";
import CodeGeneratorNewPage from "./pages/CodeGeneratorNewPage";
import CodeGeneratorPage from "./pages/CodeGeneratorPage";
import ColorsPage from "./pages/ColorsPage";
import ColumnChartPage from "./pages/ColumnChartPage";
import CompanyPage from "./pages/CompanyPage";
import CurrenciesPage from "./pages/CurrenciesPage";
import DropdownPage from "./pages/DropdownPage";
import FaqPage from "./pages/FaqPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import FormLayoutPage from "./pages/FormLayoutPage";
import FormValidationPage from "./pages/FormValidationPage";
import FormPage from "./pages/FormPage";
import GalleryPage from "./pages/GalleryPage";
import GalleryGridPage from "./pages/GalleryGridPage";
import GalleryMasonryPage from "./pages/GalleryMasonryPage";
import GalleryHoverPage from "./pages/GalleryHoverPage";
import BlogPage from "./pages/BlogPage";
import BlogDetailsPage from "./pages/BlogDetailsPage";
import AddBlogPage from "./pages/AddBlogPage";
import TestimonialsPage from "./pages/TestimonialsPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import AccessDeniedPage from "./pages/AccessDeniedPage";
import MaintenancePage from "./pages/MaintenancePage";
import BlankPagePage from "./pages/BlankPagePage";
import ImageGeneratorPage from "./pages/ImageGeneratorPage";
import ImageUploadPage from "./pages/ImageUploadPage";
import InvoiceAddPage from "./pages/InvoiceAddPage";
import InvoiceEditPage from "./pages/InvoiceEditPage";
import TeacherListPage from "./pages/TeacherListPage";
import TeacherPayoutPage from "./pages/TeacherPayoutPage";
import SubscriptionListPage from "./pages/SubscriptionListPage";
import BlockSubscriptionListPage from "./pages/BlockSubscriptionListPage";
import InvoiceListPage from "./pages/InvoiceListPage";
import PromoListPage from "./pages/PromoListPage";
import ParentListPage from "./pages/ParentListPage";
import InvoicePreviewPage from "./pages/InvoicePreviewPage";
import KanbanPage from "./pages/KanbanPage";
import CoursesPage from "./pages/CoursesPage";
import FeePage from "./pages/FeePage";
import LineChartPage from "./pages/LineChartPage";
import ListPage from "./pages/ListPage";
import MarketplaceDetailsPage from "./pages/MarketplaceDetailsPage";
import MarketplacePage from "./pages/MarketplacePage";
import NotificationAlertPage from "./pages/NotificationAlertPage";
import NotificationPage from "./pages/NotificationPage";
import PaginationPage from "./pages/PaginationPage";
import PaymentGatewayPage from "./pages/PaymentGatewayPage";
import PieChartPage from "./pages/PieChartPage";
import PortfolioPage from "./pages/PortfolioPage";
import PricingPage from "./pages/PricingPage";
import ProgressPage from "./pages/ProgressPage";
import RadioPage from "./pages/RadioPage";
import RoleAccessPage from "./pages/RoleAccessPage";
import DirectBookingPage from "./pages/DirectBookingPage";
import InpersonBookingPage from "./pages/InpersonBookingPage";
import LeadCentrePage from "./pages/LeadCentrePage";
import ToDoListPage from "./pages/ToDoListPage";
import StarRatingPage from "./pages/StarRatingPage";
import StarredPage from "./pages/StarredPage";
import SwitchPage from "./pages/SwitchPage";
import TableBasicPage from "./pages/TableBasicPage";
import TableDataPage from "./pages/TableDataPage";
import TabsPage from "./pages/TabsPage";
import TagsPage from "./pages/TagsPage";
import TermsConditionPage from "./pages/TermsConditionPage";
import TextGeneratorPage from "./pages/TextGeneratorPage";
import TextGeneratorNewPage from "./pages/TextGeneratorNewPage";
import ThemePage from "./pages/ThemePage";
import TooltipPage from "./pages/TooltipPage";
import TypographyPage from "./pages/TypographyPage";
import UsersGridPage from "./pages/UsersGridPage";
import StudentListPage from "./pages/StudentListPage";
import ViewDetailsPage from "./pages/ViewDetailsPage";
import VideoGeneratorPage from "./pages/VideoGeneratorPage";
import VideosPage from "./pages/VideosPage";
import ViewProfilePage from "./pages/ViewProfilePage";
import VoiceGeneratorPage from "./pages/VoiceGeneratorPage";
import WalletPage from "./pages/WalletPage";
import WidgetsPage from "./pages/WidgetsPage";
import WizardPage from "./pages/WizardPage";
import GroupLiveSessionsPage from "./pages/GroupLiveSessionsPage";
import RegistrationRequestsPage from "./pages/RegistrationRequestsPage";
import GroupClassInquiriesPage from "./pages/GroupClassInquiriesPage";
import WeeklyTimetablePage from "./pages/WeeklyTimetablePage";
import GroupPaymentsPage from "./pages/GroupPaymentsPage";

function App() {
  return (
    <BrowserRouter basename="/portal">
      <RouteScrollToTop />
      <Routes>

        {/* Public Routes */}
        <Route
          exact
          path="/"
          element={
            <GuestRoute>
              <SignInPage />
            </GuestRoute>
          }
        />
        <Route
          exact
          path="/sign-up"
          element={
            <GuestRoute>
              <SignUpPage />
            </GuestRoute>
          }
        />

        {/* Protected Dashboard/Home Route */}
        <Route
          exact
          path="/index"
          element={
            <ProtectedRoute>
              <HomePageSix />
            </ProtectedRoute>
          }
        />

        {/* Protected Routes - All Remaining Pages */}
        {[
          ["/email", EmailPage],
          ["/session-feedbacks", FeedbackPage],
          ["/teacher-reviews", StudentfeedbackPage],
          ["/add-user", AddUserPage],
          ["/alert", AlertPage],
          ["/assign-role", AssignRolePage],
          ["/avatar", AvatarPage],
          ["/badges", BadgesPage],
          ["/button", ButtonPage],
          ["/calendar-main", CalendarMainPage],
          ["/calendar", CalendarMainPage],
          ["/card", CardPage],
          ["/carousel", CarouselPage],
          ["/chat-empty", ChatEmptyPage],
          ["/chat-message", ChatMessagePage],
          ["/chat-profile", ChatProfilePage],
          ["/code-generator", CodeGeneratorPage],
          ["/code-generator-new", CodeGeneratorNewPage],
          ["/colors", ColorsPage],
          ["/column-chart", ColumnChartPage],
          ["/setting", CompanyPage],
          ["/currencies", CurrenciesPage],
          ["/dropdown", DropdownPage],
          ["/faq", FaqPage],
          ["/forgot-password", ForgotPasswordPage],
          ["/form-layout", FormLayoutPage],
          ["/form-validation", FormValidationPage],
          ["/form", FormPage],
          ["/gallery", GalleryPage],
          ["/gallery-grid", GalleryGridPage],
          ["/gallery-masonry", GalleryMasonryPage],
          ["/gallery-hover", GalleryHoverPage],
          ["/blog", BlogPage],
          ["/blog-details", BlogDetailsPage],
          ["/add-blog", AddBlogPage],
          ["/testimonials", TestimonialsPage],
          ["/coming-soon", ComingSoonPage],
          ["/access-denied", AccessDeniedPage],
          ["/maintenance", MaintenancePage],
          ["/blank-page", BlankPagePage],
          ["/image-generator", ImageGeneratorPage],
          ["/image-upload", ImageUploadPage],
          ["/invoice-add", InvoiceAddPage],
          ["/teacher-payouts", TeacherPayoutPage],
          ["/invoice-list", InvoiceListPage],
          ["/invoice-edit", InvoiceEditPage],
          ["/teachers-list", TeacherListPage],
          ["/subscription", SubscriptionListPage],
          ["/block-subscription", BlockSubscriptionListPage],
          ["/group-payments", GroupPaymentsPage],
          ["/promocodes", PromoListPage],
          ["/parents-list", ParentListPage],
          ["/invoice-preview", InvoicePreviewPage],
          ["/kanban", KanbanPage],
          ["subject", CoursesPage],
          ["/fee", FeePage],
          ["/line-chart", LineChartPage],
          ["/list", ListPage],
          ["/marketplace-details", MarketplaceDetailsPage],
          ["/marketplace", MarketplacePage],
          ["/notification-alert", NotificationAlertPage],
          ["/notification", NotificationPage],
          ["/pagination", PaginationPage],
          ["/payment-gateway", PaymentGatewayPage],
          ["/pie-chart", PieChartPage],
          ["/portfolio", PortfolioPage],
          ["/payments", PricingPage],
          ["/progress", ProgressPage],
          ["/radio", RadioPage],
          ["/bookings", RoleAccessPage],
          ["/group-bookings", GroupBookingPage],
          ["/group-live-sessions", GroupLiveSessionsPage],
          ["/direct-bookings", DirectBookingPage],
          ["/inperson-bookings", InpersonBookingPage],

          ["/leads-centre", LeadCentrePage],
          ["/todo-list", ToDoListPage],
          ["/registration-requests", RegistrationRequestsPage],
          ["/group-class-enquiries", GroupClassInquiriesPage],
          ["/star-rating", StarRatingPage],
          ["/starred", StarredPage],
          ["/switch", SwitchPage],
          ["/table-basic", TableBasicPage],
          ["/table-data", TableDataPage],
          ["/tabs", TabsPage],
          ["/tags", TagsPage],
          ["/terms-condition", TermsConditionPage],
          ["/text-generator-new", TextGeneratorNewPage],
          ["/text-generator", TextGeneratorPage],
          ["/theme", ThemePage],
          ["/tooltip", TooltipPage],
          ["/typography", TypographyPage],
          ["/users-grid", UsersGridPage],
          ["/Students-list", StudentListPage],
          ["/view-details", ViewDetailsPage],
          ["/video-generator", VideoGeneratorPage],
          ["/videos", VideosPage],
          ["/view-profile", ViewProfilePage],
          ["/voice-generator", VoiceGeneratorPage],
          ["/wallet", WalletPage],
          ["/widgets", WidgetsPage],
          ["/wizard", WizardPage],
          ["/weekly-timetable", WeeklyTimetablePage],
        ].map(([path, Component], index) => (
          <Route
            key={index}
            exact
            path={path}
            element={
              <ProtectedRoute>
                <Component />
              </ProtectedRoute>
            }
          />
        ))}

        {/* Catch All */}
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
