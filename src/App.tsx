import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { CourseDetailPage } from "./pages/CourseDetailPage";
import { CoursesPage } from "./pages/CoursesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GoalsPage } from "./pages/GoalsPage";
import { InsightsPage } from "./pages/InsightsPage";
import { LearningItemDetailPage } from "./pages/LearningItemDetailPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { TodayPage } from "./pages/TodayPage";
import { WeeklyPlanPage } from "./pages/WeeklyPlanPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        <Route path="/learning-items/:itemId" element={<LearningItemDetailPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/weekly" element={<WeeklyPlanPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
