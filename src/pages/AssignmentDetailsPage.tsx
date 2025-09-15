import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Assignment } from "../lib/types";
import AssignmentOverviewTab from "../components/AssignmentOverviewTab";
import AssignmentSidebar from "../components/AssignmentSidebar";
import GenericActivityTab from "../components/GenericActivityTab";

export default function AssignmentDetailsPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [activeTab, setActiveTab] = useState('details');
  const [isNewAssignment, setIsNewAssignment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [siteSubmitModalOpen, setSiteSubmitModalOpen] = useState(false);

  // Fallback: if assignmentId is undefined but pathname is /assignment/new, treat as new assignment
  const actualAssignmentId = assignmentId || (location.pathname === '/assignment/new' ? 'new' : undefined);

  useEffect(() => {
    const fetchAssignment = async () => {
      if (actualAssignmentId === 'new') {
        console.log('Creating new blank assignment...');
        // Create a blank assignment object for new assignments
        const blankAssignment: Assignment = {
          id: 'new',
          assignment_name: '',
          assignment_value: null,
          client_id: null,
          deal_id: null,
          owner_id: null,
          priority_id: null,
          transaction_type_id: null,
          due_date: null,
          progress: null,
          commission: null,
          fee: null,
          referral_fee: null,
          referral_payee_id: null,
          scoped: null,
          site_criteria: null,

          // Salesforce fields
          sf_id: null,
          sf_account_id: null,
          sf_opportunity_id: null,
          sf_owner_id: null,
          sf_priority: null,
          sf_referral_payee: null,
          sf_scoped_formula: null,
          sf_transaction_type: null,
          sf_num_of_pursuing_ownership: null,
          sf_num_of_site_submits: null,
          sf_number_of_pursuing_ownership: null,
          sf_number_of_site_submits: null,

          // Audit fields
          created_at: null,
          updated_at: null,
          created_by_id: null,
          updated_by_id: null,
          sf_created_by_id: null,
          updated_by_sf_id: null,
        };

        console.log('Blank assignment created:', blankAssignment);
        setAssignment(blankAssignment);
        setIsNewAssignment(true);
        setLoading(false);
        return;
      }

      if (!actualAssignmentId) {
        setError('No assignment ID provided');
        setLoading(false);
        return;
      }

      try {
        console.log('Fetching existing assignment with ID:', actualAssignmentId);

        const { data, error } = await supabase
          .from('assignment')
          .select('*')
          .eq('id', actualAssignmentId)
          .single();

        if (error) {
          console.error('Error fetching assignment:', error);
          setError(`Failed to load assignment: ${error.message}`);
        } else if (data) {
          console.log('Assignment loaded:', data);
          setAssignment(data);
          setIsNewAssignment(false);
        } else {
          setError('Assignment not found');
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    console.log('AssignmentDetailsPage useEffect - actualAssignmentId:', actualAssignmentId, 'type:', typeof actualAssignmentId);

    if (actualAssignmentId) {
      console.log('AssignmentDetailsPage useEffect triggered with actualAssignmentId:', actualAssignmentId);
      // Reset to Details tab when creating a new assignment
      if (actualAssignmentId === 'new') {
        setActiveTab('details');
      }
      fetchAssignment();
    } else {
      console.log('No actualAssignmentId provided - this should not happen for assignment routes');
      setError('Invalid assignment route');
      setLoading(false);
    }
  }, [actualAssignmentId]);

  // Handle assignment update/creation
  const handleAssignmentUpdate = (updatedAssignment: Assignment) => {
    setAssignment(updatedAssignment);
    // If this was a new assignment that just got saved, update the state
    if (isNewAssignment && updatedAssignment.id && updatedAssignment.id !== 'new') {
      setIsNewAssignment(false);
      // Update URL to the new assignment ID
      navigate(`/assignment/${updatedAssignment.id}`, { replace: true });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-sm text-gray-600">
            {actualAssignmentId === 'new' ? 'Initializing new assignment...' : 'Loading assignment...'}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-red-200 p-6 max-w-md mx-4">
          <div className="text-red-600 text-center">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-semibold mb-2">Assignment Not Found</h3>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-600 py-8">
          <p className="text-sm">Assignment not found</p>
        </div>
      </div>
    );
  }

  const assignmentName = assignment.assignment_name || (isNewAssignment ? 'New Assignment' : 'Unnamed Assignment');

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Assignment Header Bar - Always visible at top */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6 md:justify-start md:space-x-10">
            <div className="flex justify-start lg:w-0 lg:flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {assignmentName}
              </h1>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => navigate('/master-pipeline')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back to Pipeline
              </button>
              {!isNewAssignment && assignment.progress && typeof assignment.progress === 'string' && !assignment.progress.includes('<') && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  assignment.progress === 'Completed'
                    ? 'bg-green-100 text-green-800'
                    : assignment.progress === 'In Progress'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {assignment.progress}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area with Static Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${
          siteSubmitModalOpen ? 'lg:-translate-x-[350px]' : sidebarMinimized ? '' : 'lg:-translate-x-[100px]'
        }`}>
          <div className="max-w-4xl mx-auto p-4 pb-8">
            {/* Tab Navigation */}
            <div className="border-b border-gray-200 mb-6">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'details'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'activity'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Activity
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'details' && (
              <AssignmentOverviewTab
                assignment={assignment}
                isNewAssignment={isNewAssignment}
                onSave={handleAssignmentUpdate}
              />
            )}

            {activeTab === 'activity' && (
              <>
                {isNewAssignment || !assignment.id || assignment.id === 'new' ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Save Assignment First</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>Please save the assignment in the Details tab before viewing activities.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <GenericActivityTab
                    config={{
                      parentObject: {
                        id: assignment.id,
                        type: 'assignment' as const,
                        name: assignmentName
                      },
                      title: 'Assignment Activities',
                      showSummary: true,
                      allowAdd: true
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Assignment Sidebar - Show for all assignments including new ones */}
        <AssignmentSidebar
          assignmentId={actualAssignmentId || 'new'}
          isMinimized={sidebarMinimized}
          onMinimize={() => setSidebarMinimized(!sidebarMinimized)}
          onSiteSubmitModalChange={setSiteSubmitModalOpen}
        />
      </div>
    </div>
  );
}