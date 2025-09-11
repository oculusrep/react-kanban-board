import { useParams, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Assignment } from "../lib/types";
import AssignmentDetailsForm from "../components/AssignmentDetailsForm";
import AssignmentSidebar from "../components/AssignmentSidebar";

export default function AssignmentDetailsPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const location = useLocation();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
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
      // Optional: Update URL to the new assignment ID
      window.history.replaceState(null, '', `/assignment/${updatedAssignment.id}`);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        {actualAssignmentId === 'new' ? 'Initializing new assignment...' : 'Loading assignment...'}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-red-800 mb-2">Error Loading Assignment</h3>
          <p className="text-sm text-red-600">{error}</p>
          <button 
            onClick={() => window.history.back()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <div className="text-center text-gray-600 py-8">
          <p className="text-sm">Assignment not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Assignment Header Bar - Always visible at top */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6 md:justify-start md:space-x-10">
            <div className="flex justify-start lg:w-0 lg:flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {isNewAssignment ? 'New Assignment' : (assignment.assignment_name || 'Unnamed Assignment')}
              </h1>
            </div>
            
            {!isNewAssignment && (
              <div className="flex items-center space-x-2">
                {assignment.progress && typeof assignment.progress === 'string' && !assignment.progress.includes('<') && (
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
            )}
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
            {/* Assignment Form */}
            <AssignmentDetailsForm 
              assignment={assignment} 
              onSave={handleAssignmentUpdate} 
            />
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