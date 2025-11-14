import React from 'react';
import UserByIdDisplay from './shared/UserByIdDisplay';

interface RecordMetadataProps {
  createdAt?: string | null;
  createdById?: string | null;
  createdBySfId?: string | null;
  updatedAt?: string | null;
  updatedById?: string | null;
  updatedBySfId?: string | null;
  updatedByUser?: {
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  emailSentAt?: string | null;
  emailSentById?: string | null;
}

const RecordMetadata: React.FC<RecordMetadataProps> = ({
  createdAt,
  createdById,
  createdBySfId,
  updatedAt,
  updatedById,
  updatedBySfId,
  updatedByUser,
  emailSentAt,
  emailSentById
}) => {
  if (!createdAt && !updatedAt && !emailSentAt) return null;

  const formatTimestamp = (timestamp: string) => {
    // Supabase returns timestamps in format: "2024-01-15T10:30:00.000000+00:00" or "2024-01-15T10:30:00"
    // We need to handle both with and without timezone info
    let date: Date;

    // If timestamp already has timezone info (+00:00 or Z), parse directly
    if (timestamp.includes('+') || timestamp.endsWith('Z')) {
      date = new Date(timestamp);
    } else {
      // If no timezone, assume UTC and add Z
      date = new Date(timestamp + 'Z');
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid timestamp:', timestamp);
      return 'Invalid Date';
    }

    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
      // Note: seconds are intentionally excluded
    });
  };

  const getUpdatedByName = () => {
    if (!updatedByUser) return null;
    return updatedByUser.name ||
      `${updatedByUser.first_name || ''} ${updatedByUser.last_name || ''}`.trim() ||
      'Unknown User';
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 mt-4">
      <div className="space-y-2 text-xs text-gray-600">
        {createdAt && (
          <div>
            <span className="font-medium">Created: </span>
            <span>
              {formatTimestamp(createdAt)}
              {createdById ? (
                <> <UserByIdDisplay userId={createdById} /></>
              ) : createdBySfId ? (
                <> by SF User ({createdBySfId})</>
              ) : null}
            </span>
          </div>
        )}
        {updatedAt && (
          <div>
            <span className="font-medium">Updated: </span>
            <span>
              {formatTimestamp(updatedAt)}
              {updatedByUser ? (
                getUpdatedByName() && ` by ${getUpdatedByName()}`
              ) : updatedById ? (
                <UserByIdDisplay userId={updatedById} />
              ) : updatedBySfId ? (
                <> by SF User ({updatedBySfId})</>
              ) : null}
            </span>
          </div>
        )}
        {emailSentAt && (
          <div>
            <span className="font-medium">Email Sent: </span>
            <span>
              {formatTimestamp(emailSentAt)}
              {emailSentById && (
                <> <UserByIdDisplay userId={emailSentById} /></>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordMetadata;
