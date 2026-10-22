import { XMarkIcon } from '@heroicons/react/24/outline';
import { useOverlayStack } from '../../../hooks/useOverlayStack';
import ListingDetailPanel from '../../listings/ListingDetailPanel';
import { ListingStaging } from '../../../lib/listingStaging';

interface ListingStagingSlideoutProps {
  listingId: string;
  onClose: () => void;
  onChanged?: (listing: ListingStaging) => void;
  onOpenComp?: (compPropertyId: string) => void;
  topOffset?: number;
}

/** Right-side overlay for one NNN listing (map pin click). */
export function ListingStagingSlideout({ listingId, onClose, onChanged, onOpenComp, topOffset = 0 }: ListingStagingSlideoutProps) {
  const { zIndex, bringToFront } = useOverlayStack();
  return (
    <div
      onMouseDown={bringToFront}
      className="fixed right-0 bg-white border-l border-gray-200 shadow-xl flex flex-col w-[440px] max-w-full"
      style={{ zIndex, top: `${67 + topOffset}px`, height: `calc(100vh - ${67 + topOffset}px - 20px)` }}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 text-white/80 hover:text-white z-10"
      >
        <XMarkIcon className="w-5 h-5" />
      </button>
      <ListingDetailPanel listingId={listingId} onChanged={onChanged} onOpenComp={onOpenComp} />
    </div>
  );
}

export default ListingStagingSlideout;
