import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ActivityWithRelations } from '../hooks/useActivities';
import { parseProfessionalEmail, formatProfessionalEmailContent, ProfessionalParsedEmail, EmailFragment, ThreadedEmail } from '../utils/professionalEmailParser';
import { 
  EnvelopeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentTextIcon,
  PaperClipIcon,
  ArrowUturnLeftIcon,
  ArrowRightIcon,
  UserIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';

interface AdvancedEmailViewProps {
  activity: ActivityWithRelations;
}

const AdvancedEmailView: React.FC<AdvancedEmailViewProps> = ({ activity }) => {
  const [showEmailThread, setShowEmailThread] = useState<{ [key: string]: boolean }>({});
  
  const parsedEmail = parseProfessionalEmail(activity.description || '', activity.subject);
  
  if (!parsedEmail || !parsedEmail.content?.emailThread) {
    return <SimpleEmailFallback activity={activity} />;
  }

  // Use activity subject as email subject if not parsed
  const emailSubject = parsedEmail.headers.subject || activity.subject || 'No Subject';
  
  // Format date
  const emailDate = parsedEmail.headers.date ||
    (activity.activity_date ? format(parseISO(activity.activity_date), 'MMM d, yyyy h:mm a') : '') ||
    (activity.created_at ? format(parseISO(activity.created_at), 'MMM d, yyyy h:mm a') : '');

  const toggleEmailInThread = (emailId: string) => {
    setShowEmailThread(prev => ({
      ...prev,
      [emailId]: !prev[emailId]
    }));
  };

  return (
    <div className="space-y-4">
      {/* Email Header Card - Gmail Style */}
      <div className="bg-white border rounded-lg shadow-sm">
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <EnvelopeIcon className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="font-medium text-gray-900">{emailSubject}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {parsedEmail.metadata.isReply && (
                    <div className="flex items-center gap-1">
                      <ArrowUturnLeftIcon className="w-3 h-3" />
                      <span>Reply</span>
                    </div>
                  )}
                  {parsedEmail.metadata.isForward && (
                    <div className="flex items-center gap-1">
                      <ArrowRightIcon className="w-3 h-3" />
                      <span>Forward</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <PaperClipIcon className="w-3 h-3" />
                    <span>Email</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right text-sm text-gray-500">
              {emailDate}
            </div>
          </div>
        </div>
        
        {/* Email Recipients - Compact Gmail Style */}
        <div className="px-4 py-3 bg-white">
          <div className="grid grid-cols-1 gap-2 text-sm">
            {/* From */}
            {parsedEmail.headers.from && (
              <div className="flex">
                <span className="w-12 text-gray-500 font-medium">From:</span>
                <span className="text-gray-900">{parsedEmail.headers.from}</span>
              </div>
            )}
            
            {/* To */}
            {parsedEmail.headers.to.length > 0 && (
              <div className="flex">
                <span className="w-12 text-gray-500 font-medium">To:</span>
                <span className="text-gray-900">{parsedEmail.headers.to.join(', ')}</span>
              </div>
            )}
            
            {/* CC */}
            {parsedEmail.headers.cc.length > 0 && (
              <div className="flex">
                <span className="w-12 text-gray-500 font-medium">CC:</span>
                <span className="text-gray-900">{parsedEmail.headers.cc.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email Thread - Individual Emails */}
      {parsedEmail.content.emailThread.map((email, index) => (
        <div key={email.id} className="bg-white border rounded-lg shadow-sm">
          {/* Email Header */}
          <div className={`px-4 py-3 ${email.type === 'current' ? 'bg-white' : 'bg-gray-50'} ${index === 0 ? '' : 'border-b'}`}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  {email.type === 'quoted' && (
                    <ArrowUturnLeftIcon className="w-4 h-4 text-gray-500" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {email.headers.from || 'Unknown Sender'}
                      </span>
                      {email.type === 'current' && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          Latest
                        </span>
                      )}
                    </div>
                    {email.headers.to.length > 0 && (
                      <div className="text-sm text-gray-600">
                        to {email.headers.to.join(', ')}
                      </div>
                    )}
                    {email.headers.date && (
                      <div className="text-xs text-gray-500">
                        {email.headers.date}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {email.type === 'quoted' && (
                <button
                  onClick={() => toggleEmailInThread(email.id)}
                  className="ml-4 p-1 hover:bg-gray-100 rounded"
                >
                  {showEmailThread[email.id] ? (
                    <ChevronUpIcon className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                  )}
                </button>
              )}
            </div>
          </div>
          
          {/* Email Content */}
          {(email.type === 'current' || showEmailThread[email.id]) && (
            <div className={`px-4 py-4 ${email.type === 'quoted' ? 'bg-gray-25 border-l-4 border-gray-200' : ''}`}>
              {formatProfessionalEmailContent(email.content).map((paragraph, pIndex) => (
                <p key={pIndex} className={`mb-3 last:mb-0 leading-relaxed ${
                  email.type === 'current' ? 'text-gray-700' : 'text-gray-600 text-sm'
                }`}>
                  {paragraph}
                </p>
              ))}
              
              {/* Email Signature */}
              {email.signature && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="text-xs text-gray-500 mb-1">Signature</div>
                  {formatProfessionalEmailContent(email.signature).map((line, sIndex) => (
                    <p key={sIndex} className="text-gray-500 text-xs leading-relaxed">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Collapsed Email Preview */}
          {email.type === 'quoted' && !showEmailThread[email.id] && (
            <div className="px-4 py-2 text-sm text-gray-500 bg-gray-50">
              {formatProfessionalEmailContent(email.content)[0]?.substring(0, 100)}...
            </div>
          )}
        </div>
      ))}

      {/* Email Metadata Footer */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-600">
          {activity.sf_id && (
            <div>
              <span className="font-medium">Salesforce ID:</span> {activity.sf_id}
            </div>
          )}
          {activity.created_at && (
            <div>
              <span className="font-medium">Logged:</span>{' '}
              {format(parseISO(activity.created_at), 'MMM d, yyyy h:mm a')}
            </div>
          )}
          {activity.owner && (
            <div>
              <span className="font-medium">Logged by:</span>{' '}
              {activity.owner.first_name && activity.owner.last_name 
                ? `${activity.owner.first_name} ${activity.owner.last_name}`
                : activity.owner.name
              }
            </div>
          )}
          {activity.contact && (
            <div>
              <span className="font-medium">Related Contact:</span>{' '}
              {activity.contact.first_name} {activity.contact.last_name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Fallback component for emails that can't be parsed
const SimpleEmailFallback: React.FC<{ activity: ActivityWithRelations }> = ({ activity }) => {
  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg shadow-sm">
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <EnvelopeIcon className="w-5 h-5 text-blue-600" />
            <h3 className="font-medium text-gray-900">
              {activity.subject || 'Email Content'}
            </h3>
          </div>
        </div>
        
        <div className="px-4 py-4">
          {activity.description ? (
            formatProfessionalEmailContent(activity.description).map((paragraph, index) => (
              <p key={index} className="text-gray-700 mb-3 last:mb-0 leading-relaxed">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="text-gray-500 italic">No email content available.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdvancedEmailView;