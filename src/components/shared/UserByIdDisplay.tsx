import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface UserByIdDisplayProps {
  userId: string;
  prefix?: string;
}

/**
 * Shared component to fetch and display a user's name by their ID.
 * Looks up the user from the 'user' table by either id or auth_user_id.
 */
const UserByIdDisplay: React.FC<UserByIdDisplayProps> = ({ userId, prefix = 'by' }) => {
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    // Don't fetch if userId is null, undefined, or invalid
    if (!userId || userId === 'undefined' || userId === 'null') {
      setUserName(null);
      return;
    }

    const fetchUser = async () => {
      const { data: user } = await supabase
        .from('user')
        .select('name, first_name, last_name')
        .or(`id.eq.${userId},auth_user_id.eq.${userId}`)
        .single();

      if (user) {
        setUserName(user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User');
      }
    };
    fetchUser();
  }, [userId]);

  if (!userName) return null;
  return <> {prefix} {userName}</>;
};

export default UserByIdDisplay;
