import SlideOutPanel from '../SlideOutPanel';
import TourDetailPanel from './TourDetailPanel';

// Slideout host for the tour detail panel — overlay-first usage of the same drop-in.
interface TourDetailSlideoutProps {
  tourId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export function TourDetailSlideout({ tourId, isOpen, onClose, onChanged }: TourDetailSlideoutProps) {
  return (
    <SlideOutPanel isOpen={isOpen} onClose={onClose} title="Tour" width="540px">
      {tourId && <TourDetailPanel tourId={tourId} onChanged={onChanged} onDeleted={onClose} />}
    </SlideOutPanel>
  );
}

export default TourDetailSlideout;
