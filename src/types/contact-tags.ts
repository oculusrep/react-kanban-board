// Types for the Contact Tags system (campaigns, marketing lists)

export interface ContactTagType {
  id: string;
  tag_name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface ContactTag {
  id: string;
  contact_id: string;
  tag_id: string;
  notes: string | null;
  created_by_id: string | null;
  created_at: string;
}

// View type with joined data
export interface ContactTagView {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_email: string | null;
  contact_company: string | null;
  tag_id: string;
  tag_name: string;
  tag_description: string | null;
  tag_color: string;
  notes: string | null;
  created_at: string;
  created_by_id: string | null;
}

// For displaying tags on a contact
export interface ContactTagDisplay {
  id: string;           // contact_tag.id (junction record)
  tag_id: string;
  tag_name: string;
  tag_color: string;
  notes: string | null;
}
