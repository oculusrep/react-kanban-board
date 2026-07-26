import { useParams, useNavigate, Link } from 'react-router-dom';
import TourDetailPanel from '../components/tours/TourDetailPanel';

// Page host for the tour detail panel (drop-in reused by the slideout too).
export function TourDetailPage() {
  const { tourId } = useParams<{ tourId: string }>();
  const navigate = useNavigate();

  if (!tourId) return null;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/tours" style={{ color: '#4A6B94', fontSize: 13, textDecoration: 'none' }}>
          ← All tours
        </Link>
        <Link
          to={`/tours/${tourId}/map`}
          style={{ color: '#fff', background: '#002147', fontSize: 13, textDecoration: 'none', borderRadius: 6, padding: '6px 14px' }}
        >
          View route on map →
        </Link>
      </div>
      <TourDetailPanel tourId={tourId} onDeleted={() => navigate('/tours')} />
    </div>
  );
}

export default TourDetailPage;
