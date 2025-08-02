import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient'; // Adjust this path if needed

const KANBAN_COLUMNS = [
  'Negotiating LOI',
  'At Lease/PSA',
  'Under Contract / Contingent',
  'Booked',
  'Executed Payable',
  'Closed Paid',
];

const isClosedPaidIn2025 = (deal: any) => {
  if (deal.stage_label !== 'Closed Paid') return false;
  if (!deal.closed_date) return false;

  const date = new Date(deal.closed_date);
  return date >= new Date('2025-01-01') && date <= new Date('2025-12-31');
};

export const useDeals = () => {
  const [columns, setColumns] = useState<{ [stage: string]: any[] }>({});
  const [loading, setLoading] = useState(true);

  const fetchDeals = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('deal')
      .select(`
        id,
        deal_name,
        fee,
        deal_value,
        closed_date,
        deal_stage (
          label
        ),
        client (
          client_name
        )
      `);

    if (error) {
      console.error('Error loading deals:', error);
      setColumns({});
      setLoading(false);
      return;
    }

    const transformed = data.map(deal => ({
      ...deal,
      stage_label: deal.deal_stage?.label,
      client_name: deal.client?.client_name,
    }));

    const grouped: { [stage: string]: any[] } = KANBAN_COLUMNS.reduce((acc, label) => {
      acc[label] = [];
      return acc;
    }, {});

    transformed.forEach(deal => {
      const stage = deal.stage_label;

      if (stage === 'Closed Paid' && isClosedPaidIn2025(deal)) {
        grouped['Closed Paid'].push(deal);
      } else if (KANBAN_COLUMNS.includes(stage)) {
        grouped[stage].push(deal);
      }
    });

    setColumns(grouped);
    setLoading(false);
  };

  useEffect(() => {
    fetchDeals();
  }, []);

  return { columns, loading, refetch: fetchDeals };
};
