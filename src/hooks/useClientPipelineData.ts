import { useEffect, useState, useCallback, useId } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface PipelineSiteSubmit {
  id: string;
  site_submit_name: string;
  submit_stage_id: string;
  date_submitted: string | null;
  notes: string | null;
  delivery_timeframe: string | null;
  ti: number | null;
  year_1_rent: number | null;
  competitor_data: string | null;
  property_unit_id: string | null;
  property: {
    id: string;
    property_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    available_sqft: number | null;
    building_sqft: number | null;
    acres: number | null;
    asking_lease_price: number | null;
    asking_purchase_price: number | null;
    rent_psf: number | null;
    nnn_psf: number | null;
    all_in_rent: number | null;
  } | null;
  property_unit: {
    id: string;
    property_unit_name: string | null;
    sqft: number | null;
    rent: number | null;
    nnn: number | null;
  } | null;
  submit_stage: {
    id: string;
    name: string;
  } | null;
}

export interface PipelineSubmitStage {
  id: string;
  name: string;
}

interface UseClientPipelineDataOptions {
  clientIds: string[];
  visibleStageNames?: string[];
  refreshTrigger?: number;
  enabled?: boolean;
}

interface UseClientPipelineDataResult {
  siteSubmits: PipelineSiteSubmit[];
  stages: PipelineSubmitStage[];
  loading: boolean;
  error: string | null;
  applyStatusChange: (siteSubmitId: string, newStageId: string, newStageName: string) => void;
}

export function useClientPipelineData({
  clientIds,
  visibleStageNames,
  refreshTrigger,
  enabled = true,
}: UseClientPipelineDataOptions): UseClientPipelineDataResult {
  const [siteSubmits, setSiteSubmits] = useState<PipelineSiteSubmit[]>([]);
  const [stages, setStages] = useState<PipelineSubmitStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const channelSuffix = useId();
  const clientIdsKey = clientIds.join(',');
  const stageNamesKey = visibleStageNames ? visibleStageNames.join(',') : '';

  useEffect(() => {
    let cancelled = false;

    async function fetchStages() {
      let query = supabase.from('submit_stage').select('id, name');

      if (visibleStageNames && visibleStageNames.length > 0) {
        query = query.in('name', visibleStageNames);
      }

      const { data, error: fetchError } = await query;

      if (cancelled) return;

      if (fetchError) {
        console.error('Error fetching stages:', fetchError);
      } else {
        setStages(data || []);
      }
    }

    fetchStages();
    return () => {
      cancelled = true;
    };
  }, [stageNamesKey]);

  useEffect(() => {
    if (!enabled) {
      setSiteSubmits([]);
      setLoading(false);
      return;
    }

    if (clientIds.length === 0) {
      setSiteSubmits([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSiteSubmits() {
      setLoading(true);
      setError(null);

      try {
        let stageQuery = supabase.from('submit_stage').select('id');
        if (visibleStageNames && visibleStageNames.length > 0) {
          stageQuery = stageQuery.in('name', visibleStageNames);
        }

        const { data: stageData } = await stageQuery;
        const visibleStageIds = stageData?.map((s) => s.id) || [];

        if (visibleStageIds.length === 0) {
          if (!cancelled) {
            setSiteSubmits([]);
            setLoading(false);
          }
          return;
        }

        const { data, error: fetchError } = await supabase
          .from('site_submit')
          .select(
            `
            id,
            site_submit_name,
            submit_stage_id,
            date_submitted,
            notes,
            delivery_timeframe,
            ti,
            year_1_rent,
            competitor_data,
            property_unit_id,
            property:property_id (
              id,
              property_name,
              address,
              city,
              state,
              zip,
              available_sqft,
              building_sqft,
              acres,
              asking_lease_price,
              asking_purchase_price,
              rent_psf,
              nnn_psf,
              all_in_rent
            ),
            property_unit:property_unit_id (
              id,
              property_unit_name,
              sqft,
              rent,
              nnn
            ),
            submit_stage!site_submit_submit_stage_id_fkey (
              id,
              name
            )
          `
          )
          .in('client_id', clientIds)
          .in('submit_stage_id', visibleStageIds);

        if (fetchError) throw fetchError;

        if (!cancelled) {
          setSiteSubmits((data || []) as unknown as PipelineSiteSubmit[]);
        }
      } catch (err) {
        console.error('Error fetching site submits:', err);
        if (!cancelled) {
          setError('Failed to load site submits');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSiteSubmits();

    return () => {
      cancelled = true;
    };
  }, [clientIdsKey, stageNamesKey, refreshTrigger, enabled]);

  useEffect(() => {
    if (!enabled || clientIds.length === 0) return;

    const channel = supabase.channel(`client-pipeline-site-submit-${channelSuffix}`);
    channel
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'site_submit' },
        (payload) => {
          setSiteSubmits((prev) =>
            prev.map((ss) => {
              if (ss.id === payload.new.id) {
                const newStage = stages.find((s) => s.id === payload.new.submit_stage_id);
                return {
                  ...ss,
                  submit_stage_id: payload.new.submit_stage_id,
                  submit_stage: newStage
                    ? { id: newStage.id, name: newStage.name }
                    : ss.submit_stage,
                };
              }
              return ss;
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientIdsKey, stages, enabled, channelSuffix]);

  useEffect(() => {
    if (!enabled || clientIds.length === 0) return;

    const channel = supabase.channel(`client-pipeline-property-${channelSuffix}`);
    channel
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'property' },
        (payload) => {
          setSiteSubmits((prev) =>
            prev.map((ss) => {
              if (ss.property?.id === payload.new.id) {
                return {
                  ...ss,
                  property: {
                    ...ss.property,
                    available_sqft: payload.new.available_sqft,
                    building_sqft: payload.new.building_sqft,
                    acres: payload.new.acres,
                    asking_lease_price: payload.new.asking_lease_price,
                    asking_purchase_price: payload.new.asking_purchase_price,
                    rent_psf: payload.new.rent_psf,
                    nnn_psf: payload.new.nnn_psf,
                    all_in_rent: payload.new.all_in_rent,
                  },
                };
              }
              return ss;
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientIdsKey, enabled, channelSuffix]);

  useEffect(() => {
    if (!enabled || clientIds.length === 0) return;

    const channel = supabase.channel(`client-pipeline-property-unit-${channelSuffix}`);
    channel
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'property_unit' },
        (payload) => {
          setSiteSubmits((prev) =>
            prev.map((ss) => {
              if (ss.property_unit?.id === payload.new.id) {
                return {
                  ...ss,
                  property_unit: {
                    ...ss.property_unit,
                    sqft: payload.new.sqft,
                    rent: payload.new.rent,
                    nnn: payload.new.nnn,
                  },
                };
              }
              return ss;
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientIdsKey, enabled, channelSuffix]);

  const applyStatusChange = useCallback(
    (siteSubmitId: string, newStageId: string, newStageName: string) => {
      setSiteSubmits((prev) =>
        prev.map((ss) => {
          if (ss.id === siteSubmitId) {
            return {
              ...ss,
              submit_stage_id: newStageId,
              submit_stage: { id: newStageId, name: newStageName },
            };
          }
          return ss;
        })
      );
    },
    []
  );

  return { siteSubmits, stages, loading, error, applyStatusChange };
}
