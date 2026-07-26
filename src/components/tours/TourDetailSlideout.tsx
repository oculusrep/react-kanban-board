import SlideOutPanel from '../SlideOutPanel';
import TourDetailPanel from './TourDetailPanel';

// Slideout host for the tour detail panel — overlay-first usage of the same drop-in.
interface TourDetailSlideoutProps {
  tourId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
  /** Computed per-stop arrival + drive-to-next, when hosted alongside the map. */
  stopSchedule?: Record<string, { arrivalMin: number | null; minsToNext: number | null }>;
}

export function TourDetailSlideout({ tourId, isOpen, onClose, onChanged, stopSchedule }: TourDetailSlideoutProps) {
  return (
    <SlideOutPanel isOpen={isOpen} onClose={onClose} title="Tour" width="540px">
      {tourId && (
        <TourDetailPanel tourId={tourId} onChanged={onChanged} onDeleted={onClose} stopSchedule={stopSchedule} />
      )}
    </SlideOutPanel>
  );
}

export default TourDetailSlideout;
