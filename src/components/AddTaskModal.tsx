import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';
import { useAuth } from '../contexts/AuthContext';
import {
  Activity,
  ActivityInsert,
  ActivityType,
  ActivityPriority,
  ActivityTaskType,
  ActivityStatus,
  User,
  Contact,
  ParentObject,
  RelatedOption
} from '../types/activity';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (activity: Activity) => void;
  parentObject?: ParentObject;
  // Legacy support
  dealId?: string;
  // Edit mode
  editMode?: boolean;
  existingTask?: any; // ActivityWithRelations
}

interface FormData {
  subject: string;
  owner_id: string | null;
  activity_date: string;
  completed_at: string;
  activity_type_id: string | null;
  activity_task_type_id: string | null;
  activity_priority_id: string | null;
  status_id: string | null;
  related_object_type: string;
  related_object_id: string | null;
  description: string;
}


const AddTaskModal: React.FC<AddTaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  parentObject,
  dealId, // Legacy support
  editMode = false,
  existingTask
}) => {
  const { user } = useAuth();
  // Handle legacy dealId prop
  const effectiveParentObject = parentObject || (dealId ? { id: dealId, type: 'deal' as const, name: '' } : null);

  const getRelatedObjectFromTask = (task: any) => {
    if (task.deal_id) return { type: 'deal' as const, id: task.deal_id };
    if (task.client_id) return { type: 'client' as const, id: task.client_id };
    if (task.property_id) return { type: 'property' as const, id: task.property_id };
    if (task.site_submit_id) return { type: 'site_submit' as const, id: task.site_submit_id };
    if (task.contact_id) return { type: 'contact' as const, id: task.contact_id };
    return null;
  };

  const relatedObj = editMode && existingTask ? getRelatedObjectFromTask(existingTask) : effectiveParentObject;

  const [formData, setFormData] = useState<FormData>({
    subject: editMode && existingTask ? existingTask.subject || '' : '',
    owner_id: editMode && existingTask ? existingTask.owner_id : null,
    activity_date: editMode && existingTask && existingTask.activity_date
      ? new Date(existingTask.activity_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    completed_at: editMode && existingTask && existingTask.completed_at
      ? new Date(existingTask.completed_at).toISOString().split('T')[0]
      : '',
    activity_type_id: editMode && existingTask ? existingTask.activity_type_id : null,
    activity_task_type_id: editMode && existingTask ? existingTask.activity_task_type_id : null,
    activity_priority_id: editMode && existingTask ? existingTask.activity_priority_id : null,
    status_id: editMode && existingTask ? existingTask.status_id : null,
    related_object_type: relatedObj?.type || 'deal',
    related_object_id: relatedObj?.id || null,
    description: editMode && existingTask ? existingTask.description || '' : '',
  });

  const [users, setUsers] = useState<User[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [activityTaskTypes, setActivityTaskTypes] = useState<ActivityTaskType[]>([]);
  const [activityPriorities, setActivityPriorities] = useState<ActivityPriority[]>([]);
  const [activityStatuses, setActivityStatuses] = useState<ActivityStatus[]>([]);
  const [relatedOptions, setRelatedOptions] = useState<RelatedOption[]>([]);
  const [relatedSearchTerm, setRelatedSearchTerm] = useState('');
  const [showRelatedDropdown, setShowRelatedDropdown] = useState(false);
  const [selectedRelatedObject, setSelectedRelatedObject] = useState<RelatedOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Related object type options
  const relatedObjectTypes = [
    { value: 'contact', label: 'Contact' },
    { value: 'client', label: 'Client' },
    { value: 'deal', label: 'Deal' },
    { value: 'property', label: 'Property' },
    { value: 'site_submit', label: 'Site Submit' },
  ];

  // Load dropdown data
  useEffect(() => {
    const loadData = async () => {
      if (!isOpen) return;
      
      setLoading(true);
      try {
        // Load all lookup tables in parallel
        const [
          usersResult,
          typesResult,
          taskTypesResult,
          prioritiesResult,
          statusesResult
        ] = await Promise.all([
          supabase.from('user').select('id, first_name, last_name, email').order('first_name, last_name'),
          supabase.from('activity_type').select('*').eq('active', true).order('name'),
          supabase.from('activity_task_type').select('*').eq('active', true).order('name'),
          supabase.from('activity_priority').select('*').eq('active', true).order('name'),
          supabase.from('activity_status').select('*').eq('active', true).order('name')
        ]);

        // Filter out automated/system users
        if (usersResult.data) {
          const filteredUsers = usersResult.data.filter(dbUser => {
            const name = `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.toLowerCase().trim();
            const excludeNames = [
              'automated process',
              'chatter',
              'insights',
              'platform integration'
            ];
            return !excludeNames.some(excludeName => name.includes(excludeName));
          });
          setUsers(filteredUsers);

          // Set default assigned user to current logged in user
          if (user?.email) {
            const currentUser = filteredUsers.find(dbUser =>
              dbUser.email?.toLowerCase() === user.email?.toLowerCase()
            );
            if (currentUser && !formData.owner_id) {
              setFormData(prev => ({ ...prev, owner_id: currentUser.id }));
            }
          } else {
            // Development fallback when authentication is disabled
            if (!formData.owner_id) {
              setFormData(prev => ({ ...prev, owner_id: 'd4903827-c034-4acf-8765-2c1c65eac655' }));
            }
          }
        }
        if (typesResult.data) setActivityTypes(typesResult.data);
        if (taskTypesResult.data) setActivityTaskTypes(taskTypesResult.data);
        if (prioritiesResult.data) setActivityPriorities(prioritiesResult.data);
        if (statusesResult.data) {
          console.log('Loaded activity statuses:', statusesResult.data.map(s => ({ id: s.id, name: s.name })));
          setActivityStatuses(statusesResult.data);
        }

        // Set default task type to "Task" if available (always set when modal opens)
        if (typesResult.data) {
          const taskType = typesResult.data.find(type => type.name === 'Task');
          if (taskType && !formData.activity_type_id) {
            setFormData(prev => ({ ...prev, activity_type_id: taskType.id }));
          }
        }

        // Set default status to "Open" if available (only when creating new task)
        if (statusesResult.data && statusesResult.data.length > 0 && !editMode) {
          const openStatus = statusesResult.data.find(status => status.name?.toLowerCase() === 'open');
          const defaultStatus = openStatus || statusesResult.data[0];
          setFormData(prev => ({ ...prev, status_id: defaultStatus.id }));
        }

        // Load current parent object info and set as default related object
        if (effectiveParentObject) {
          let objectData = null;
          let labelField = '';
          
          switch (effectiveParentObject.type) {
            case 'deal':
              const dealResult = await supabase.from('deal').select('id, deal_name').eq('id', effectiveParentObject.id).single();
              objectData = dealResult.data;
              labelField = 'deal_name';
              break;
            case 'contact':
              const contactResult = await supabase.from('contact').select('id, first_name, last_name, company').eq('id', effectiveParentObject.id).single();
              objectData = contactResult.data;
              break;
            case 'client':
              const clientResult = await supabase.from('client').select('id, client_name').eq('id', effectiveParentObject.id).single();
              objectData = clientResult.data;
              labelField = 'client_name';
              break;
            case 'property':
              const propertyResult = await supabase.from('property').select('id, property_name').eq('id', effectiveParentObject.id).single();
              objectData = propertyResult.data;
              labelField = 'property_name';
              break;
            case 'site_submit':
              const siteSubmitResult = await supabase.from('site_submit').select('id, site_submit_name').eq('id', effectiveParentObject.id).single();
              objectData = siteSubmitResult.data;
              labelField = 'site_submit_name';
              break;
          }
          
          if (objectData) {
            let label = '';
            if (effectiveParentObject.type === 'contact') {
              const contact = objectData as any;
              label = `${contact.first_name} ${contact.last_name}`;
              if (contact.company) label += ` (${contact.company})`;
            } else {
              label = objectData[labelField as keyof typeof objectData] as string;
            }
            
            const defaultRelatedObject: RelatedOption = {
              id: objectData.id,
              label: label || effectiveParentObject.name,
              type: effectiveParentObject.type
            };
            setSelectedRelatedObject(defaultRelatedObject);
            setRelatedSearchTerm(defaultRelatedObject.label);
            setFormData(prev => ({ 
              ...prev, 
              related_object_type: effectiveParentObject.type,
              related_object_id: effectiveParentObject.id 
            }));
          }
        }

      } catch (error) {
        console.error('Error loading form data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen]);

  // Load related objects when type changes or search term updates
  useEffect(() => {
    const loadRelatedOptions = async () => {
      if (!formData.related_object_type) {
        setRelatedOptions([]);
        return;
      }

      try {
        let query;
        let labelField: string;

        switch (formData.related_object_type) {
          case 'contact':
            query = supabase.from('contact').select('id, first_name, last_name, company');
            labelField = 'first_name';
            break;
          case 'client':
            query = supabase.from('client').select('id, client_name');
            labelField = 'client_name';
            break;
          case 'deal':
            query = supabase.from('deal').select('id, deal_name');
            labelField = 'deal_name';
            break;
          case 'property':
            query = supabase.from('property').select('id, property_name');
            labelField = 'property_name';
            break;
          case 'site_submit':
            query = supabase.from('site_submit').select('id, site_submit_name');
            labelField = 'site_submit_name';
            break;
          default:
            setRelatedOptions([]);
            return;
        }

        // Add search filter if search term exists
        if (relatedSearchTerm && relatedSearchTerm.length > 0) {
          switch (formData.related_object_type) {
            case 'contact':
              query = query.or(`first_name.ilike.%${relatedSearchTerm}%,last_name.ilike.%${relatedSearchTerm}%,company.ilike.%${relatedSearchTerm}%`);
              break;
            case 'client':
              query = query.ilike('client_name', `%${relatedSearchTerm}%`);
              break;
            case 'deal':
              query = query.ilike('deal_name', `%${relatedSearchTerm}%`);
              break;
            case 'property':
              query = query.ilike('property_name', `%${relatedSearchTerm}%`);
              break;
            case 'site_submit':
              query = query.ilike('site_submit_name', `%${relatedSearchTerm}%`);
              break;
          }
        }

        const { data, error } = await query.order(labelField).limit(20);
        
        if (error) {
          console.error('Error loading related options:', error);
          return;
        }

        if (data) {
          const options: RelatedOption[] = data.map(item => {
            let label: string;
            if (formData.related_object_type === 'contact') {
              const contact = item as any;
              label = `${contact.first_name} ${contact.last_name}`;
              if (contact.company) label += ` (${contact.company})`;
            } else {
              label = item[labelField as keyof typeof item] as string;
            }
            
            return {
              id: item.id,
              label,
              type: formData.related_object_type
            };
          });
          setRelatedOptions(options);
        }
      } catch (error) {
        console.error('Error loading related options:', error);
      }
    };

    // Debounce the search
    const timeoutId = setTimeout(() => {
      if (formData.related_object_type) {
        loadRelatedOptions();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [formData.related_object_type, relatedSearchTerm]);

  // Reset form when modal closes and set defaults when it opens
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        subject: '',
        owner_id: null,
        activity_date: new Date().toISOString().split('T')[0],
        activity_type_id: null,
        activity_task_type_id: null,
        activity_priority_id: null,
        status_id: null,
        related_object_type: effectiveParentObject?.type || 'deal',
        related_object_id: effectiveParentObject?.id || null,
        description: '',
      });
      setErrors({});
      setRelatedSearchTerm('');
      setSelectedRelatedObject(null);
      setShowRelatedDropdown(false);
    } else if (isOpen && activityTypes.length > 0) {
      // Set default task type to "Task" when modal opens and data is available
      const taskType = activityTypes.find(type => type.name === 'Task');
      if (taskType && !formData.activity_type_id) {
        setFormData(prev => ({ ...prev, activity_type_id: taskType.id }));
      }

      // Set default assigned user to current logged in user when modal reopens
      if (user?.email && users.length > 0 && !formData.owner_id) {
        const currentUser = users.find(dbUser =>
          dbUser.email?.toLowerCase() === user.email?.toLowerCase()
        );
        if (currentUser) {
          setFormData(prev => ({ ...prev, owner_id: currentUser.id }));
        }
      } else if (!user?.email && !formData.owner_id) {
        // Development fallback when authentication is disabled
        setFormData(prev => ({ ...prev, owner_id: 'd4903827-c034-4acf-8765-2c1c65eac655' }));
      }
    }
  }, [isOpen, effectiveParentObject, activityTypes, formData.activity_type_id]);

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleRelatedTypeChange = (newType: string) => {
    updateFormData('related_object_type', newType);
    updateFormData('related_object_id', null);
    setRelatedSearchTerm('');
    setSelectedRelatedObject(null);
    setShowRelatedDropdown(false);
  };

  const handleRelatedSearch = (searchTerm: string) => {
    setRelatedSearchTerm(searchTerm);
    setShowRelatedDropdown(searchTerm.length > 0);
    
    // Clear selection if search term doesn't match selected object
    if (selectedRelatedObject && !selectedRelatedObject.label.toLowerCase().includes(searchTerm.toLowerCase())) {
      setSelectedRelatedObject(null);
      updateFormData('related_object_id', null);
    }
  };

  const handleRelatedSelect = (option: RelatedOption) => {
    setSelectedRelatedObject(option);
    setRelatedSearchTerm(option.label);
    updateFormData('related_object_id', option.id);
    setShowRelatedDropdown(false);
  };

  const filteredRelatedOptions = relatedOptions.filter(option =>
    option.label.toLowerCase().includes(relatedSearchTerm.toLowerCase())
  );

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.subject?.trim()) {
      newErrors.subject = 'Subject is required';
    }
    if (!formData.activity_type_id) {
      newErrors.activity_type_id = 'Task type is required';
    }
    if (!formData.status_id) {
      newErrors.status_id = 'Status is required';
    }
    if (!formData.activity_date) {
      newErrors.activity_date = 'Due date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      // Prepare activity data - omit timestamps to let database auto-generate
      const activityData: ActivityInsert = {
        subject: formData.subject,
        owner_id: formData.owner_id,
        activity_date: formData.activity_date,
        completed_at: formData.completed_at || null,
        activity_type_id: formData.activity_type_id,
        activity_task_type_id: formData.activity_task_type_id,
        activity_priority_id: formData.activity_priority_id,
        status_id: formData.status_id,
        description: formData.description || null,
        deal_id: effectiveParentObject?.type === 'deal' ? effectiveParentObject.id : null,
      };

      // Set specific foreign key fields only (skip generic related_object fields for now)
      if (formData.related_object_type && formData.related_object_id) {
        switch (formData.related_object_type) {
          case 'contact':
            activityData.contact_id = formData.related_object_id;
            break;
          case 'client':
            activityData.client_id = formData.related_object_id;
            break;
          case 'deal':
            activityData.deal_id = formData.related_object_id;
            break;
          case 'property':
            activityData.property_id = formData.related_object_id;
            break;
          case 'site_submit':
            activityData.site_submit_id = formData.related_object_id;
            break;
          case 'assignment':
            activityData.assignment_id = formData.related_object_id;
            break;
        }
      }

      let data, error;

      if (editMode && existingTask) {
        // Update existing task
        const updateData = {
          ...activityData,
          updated_at: new Date().toISOString()
        };
        console.log('🔄 UPDATING task:', existingTask.id);
        console.log('📝 Update data:', JSON.stringify(updateData, null, 2));
        console.log('📅 Due date being updated to:', updateData.activity_date);

        const result = await supabase
          .from('activity')
          .update(prepareUpdate(updateData))
          .eq('id', existingTask.id)
          .select('*')
          .single();

        data = result.data;
        error = result.error;

        if (error) {
          console.error('❌ Update error:', error);
        } else {
          console.log('✅ Update successful!');
          console.log('📊 Updated task data:', JSON.stringify(data, null, 2));
        }
      } else {
        // Insert new task
        console.log('About to insert activity data:', JSON.stringify(activityData, null, 2));
        const result = await supabase
          .from('activity')
          .insert(prepareInsert(activityData))
          .select('*')
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      onSave?.(data);
      onClose();

    } catch (error) {
      console.error('Error saving task:', error);
      console.error('Full error details:', JSON.stringify(error, null, 2));
      console.error('Form data that was being saved:', formData);
      console.error('Activity data that was being attempted to save:', JSON.stringify({
        subject: formData.subject,
        owner_id: formData.owner_id,
        activity_date: formData.activity_date,
        activity_type_id: formData.activity_type_id,
        activity_task_type_id: formData.activity_task_type_id,
        activity_priority_id: formData.activity_priority_id,
        status_id: formData.status_id,
        description: formData.description,
        deal_id: effectiveParentObject?.type === 'deal' ? effectiveParentObject.id : null,
        related_object_type: formData.related_object_type,
        related_object_id: formData.related_object_id
      }, null, 2));
      alert(`Error saving task: ${error instanceof Error ? error.message : 'Unknown error'}. Check console for details.`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editMode || !existingTask) return;

    const confirmDelete = window.confirm('Are you sure you want to delete this task? This action cannot be undone.');
    if (!confirmDelete) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('activity')
        .delete()
        .eq('id', existingTask.id);

      if (error) throw error;

      console.log('✅ Task deleted successfully');
      onSave?.(existingTask); // Trigger refetch
      onClose();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert(`Error deleting task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[60]" onClick={onClose} />
      
      {/* Modal */}
      <div className={`fixed inset-0 lg:inset-y-0 lg:right-0 lg:left-auto w-full lg:w-[600px] bg-white shadow-xl transform transition-transform duration-300 z-[60] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } flex flex-col`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <h2 className="text-xl font-semibold text-gray-900">{editMode ? 'Edit Task' : 'Add New Task'}</h2>
          <div className="flex items-center gap-2">
            {editMode && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="p-2 hover:bg-red-50 rounded-full transition-colors group"
                title="Delete task"
              >
                <svg className="w-6 h-6 text-gray-400 group-hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Task Details
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject *
                  </label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => updateFormData('subject', e.target.value)}
                    className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                      errors.subject ? 'border-red-300' : ''
                    }`}
                    placeholder="Enter task subject"
                  />
                  {errors.subject && (
                    <p className="mt-1 text-sm text-red-600">{errors.subject}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assigned To
                  </label>
                  <select
                    value={formData.owner_id || ''}
                    onChange={(e) => updateFormData('owner_id', e.target.value || null)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select user...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.first_name} {user.last_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    value={formData.activity_date}
                    onChange={(e) => updateFormData('activity_date', e.target.value)}
                    className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                      errors.activity_date ? 'border-red-300' : ''
                    }`}
                  />
                  {errors.activity_date && (
                    <p className="mt-1 text-sm text-red-600">{errors.activity_date}</p>
                  )}
                </div>
              </div>

              {/* Optional Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Task Category
                  </label>
                  <select
                    value={formData.activity_task_type_id || ''}
                    onChange={(e) => updateFormData('activity_task_type_id', e.target.value || null)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select category...</option>
                    {activityTaskTypes.map((taskType) => (
                      <option key={taskType.id} value={taskType.id}>
                        {taskType.name} {taskType.category && `(${taskType.category})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.activity_priority_id || ''}
                    onChange={(e) => updateFormData('activity_priority_id', e.target.value || null)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select priority...</option>
                    {activityPriorities.map((priority) => (
                      <option key={priority.id} value={priority.id}>
                        {priority.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status *
                  </label>
                  <select
                    value={formData.status_id || ''}
                    onChange={(e) => updateFormData('status_id', e.target.value || null)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select status...</option>
                    {activityStatuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                  {errors.status_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.status_id}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Completed Date
                  </label>
                  <input
                    type="date"
                    value={formData.completed_at}
                    onChange={(e) => updateFormData('completed_at', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Additional Details
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) => updateFormData('description', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    placeholder="Enter task description..."
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {saving ? (editMode ? 'Updating...' : 'Creating...') : (editMode ? 'Update Task' : 'Create Task')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddTaskModal;
