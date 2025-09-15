import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import PropertyDetailScreen from "../components/property/PropertyDetailScreen";
import { Database } from "../../database-schema";
import { useTrackPageView } from "../hooks/useRecentlyViewed";

type Property = Database['public']['Tables']['property']['Row'];

export default function PropertyDetailsPage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { trackView } = useTrackPageView();

  const isCreateMode = propertyId === 'create';

  useEffect(() => {
    const fetchProperty = async () => {
      if (!propertyId || isCreateMode) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("property")
          .select("*")
          .eq("id", propertyId)
          .single();

        if (error) throw error;
        setProperty(data);
        // Track this property as recently viewed
        trackView(
          data.id,
          'property',
          data.property_name || 'Unnamed Property',
          `${data.address || ''} ${data.city || ''} ${data.state || ''}`.trim() || undefined
        );
      } catch (err) {
        console.error('Error fetching property:', err);
        setError(err instanceof Error ? err.message : 'Failed to load property');
      } finally {
        setLoading(false);
      }
    };

    fetchProperty();
  }, [propertyId, isCreateMode]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleSave = (updatedProperty: Property) => {
    setProperty(updatedProperty);
    // Navigate to the view mode of the created/updated property
    if (isCreateMode) {
      navigate(`/property/${updatedProperty.id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-sm text-gray-600">Loading property...</div>
        </div>
      </div>
    );
  }

  if (error && !isCreateMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-red-200 p-6 max-w-md mx-4">
          <div className="text-red-600 text-center">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-semibold mb-2">Property Not Found</h3>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PropertyDetailScreen
      propertyId={isCreateMode ? undefined : propertyId}
      mode={isCreateMode ? "create" : "view"}
      onSave={handleSave}
      onBack={handleBack}
    />
  );
}