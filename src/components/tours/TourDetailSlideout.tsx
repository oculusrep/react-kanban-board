import SlideOutPanel from '../SlideOutPanel';
import TourDetailPanel from './TourDetailPanel';
import type { StopTiming } from '../../lib/tourRouting';
import type { DayTotals } from './TourStopCard';

// Slideout host for the tour detail panel — overlay-first usage of the same drop-in.
interface TourDetailSlideoutProps {
  tourId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
  /** Computed per-stop arrival + drive-to-next, when hosted alongside the map. */
  stopSchedule?: Record<string, StopTiming>;
  /** Per-day Drive/Stops/Finish totals, when hosted alongside the map. */
  daySummaries?: Record<string, DayTotals>;
}

export function TourDetailSlideout({ tourId, isOpen, onClose, onChanged, stopSchedule, daySummaries }: TourDetailSlideoutProps) {
  return (
    <SlideOutPanel isOpen={isOpen} onClose={onClose} title="Tour" width="540px">
      {tourId && (
        <TourDetailPanel tourId={tourId} onChanged={onChanged} onDeleted={onClose} stopSchedule={stopSchedule} daySummaries={daySummaries} />
      )}
    </SlideOutPanel>
  );
}

export default TourDetailSlideout;
