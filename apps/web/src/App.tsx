import { Routes, Route } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppLayout } from "./components/layout/AppLayout";
import { InterviewView } from "./routes/InterviewView";
import { ReviewView } from "./routes/ReviewView";
import { GalleryView } from "./routes/GalleryView";
import { RunDetailView } from "./routes/RunDetailView";

/**
 * App router: Interview `/` · Review `/review` · Gallery `/gallery` ·
 * Detail `/gallery/:runId`. `MotionConfig reducedMotion="user"` gates all
 * framer-motion animations behind the user's reduced-motion preference.
 */
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<InterviewView />} />
          <Route path="/review" element={<ReviewView />} />
          <Route path="/gallery" element={<GalleryView />} />
          <Route path="/gallery/:runId" element={<RunDetailView />} />
        </Route>
      </Routes>
    </MotionConfig>
  );
}