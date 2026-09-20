-- Stop fabricating coordinates: retire the pins that were never real.
--
-- Every committed municipal_project address was re-geocoded on 2026-09-20 and
-- classified by Google's location_type. A vague address was being written as if
-- it were the project's location; those rows become UNPLACED (centroid NULL) with
-- the reason recorded, and are placed by hand from the same project card.
--
-- Audited 352 projects:
--   ROOFTOP / RANGE_INTERPOLATED  252  precise, untouched
--   APPROXIMATE                    17  county / city / zip centroid
--   GEOMETRIC_CENTER               83  road segment centre
--   other                           0  no usable geocode
--
-- The 7 stacked pins that prompted this (4 on the Forsyth County centroid, 3 on
-- Cumming's) are all in the APPROXIMATE set.
--
-- 76 of the imprecise rows already have a hand-drawn polygon. Those are NOT
-- unplaced — a polygon is a better source than any address geocode, so their pin
-- is re-derived with ST_PointOnSurface (guaranteed inside the shape, unlike the
-- vertex-average the drawer used to compute).


-- ---- imprecise geocode but a polygon exists: re-derive the pin from the shape
UPDATE municipal_project
   SET centroid = ST_PointOnSurface(geometry),
       centroid_source = 'polygon',
       unplaced_reason = NULL
 WHERE id IN (
    'b0a34b32-feb7-4611-8933-ca4a7f16baa8',
    'f06fad0b-381a-4671-9d8e-0d4ff817fdc7',
    '74c027ee-c436-493d-bede-ec02427243b8',
    '60bf61ab-7a78-449b-8a1c-49a1cf0f31c5',
    'ab91ffcd-28dc-432e-a161-279d24b80e06',
    '87aeb3a3-201d-40c8-8361-6e536cfcb450',
    '7d51129e-7ba9-4e25-ad1b-e03d225ba337',
    '591e7b7b-4d56-4a0b-acc5-278d9a0a9c8a',
    'd15f3f39-dfae-4d37-bf45-02085b1fc98d',
    '34a1768c-a74b-4c1f-a85f-1b956d01fc07',
    '423ed71e-428e-4970-9764-e7209be07aef',
    '1b2ce1ab-b815-4c43-ae25-9b6521c06f8a',
    '58275050-bec1-40bb-9eb6-1f33602ea7d4',
    '7e0aad67-2bc5-4276-bd4b-2576ca2bca62',
    '54888729-b432-451d-97d6-2b530bf31bf9',
    '1a7a3107-30c0-41c2-bd91-0c8bca4e0d3a',
    '57ad016c-03f5-4705-a2d5-24f6cb01539d',
    '4d81676c-31f2-4c0d-b0e2-fdde9764f383',
    'a2dc0ebe-6710-4643-9fb0-764de52f3ca1',
    '18aeea1a-2750-4483-a554-2b76488eea93',
    '4f6aff21-b35e-4d97-85a5-58b430b2b1a8',
    'd096b72b-a51f-4dfe-9af4-315d6180c4e2',
    '95d614ac-980b-4b65-aa7a-e5b1abb878b8',
    '62b424a5-036b-44f4-8475-150401c910e8',
    '2bc9063a-0b6e-4602-9c7c-3382708296e5',
    '59a0d870-8d00-42a8-8821-a8a3453f41a6',
    '9c396cee-b2e6-4b67-bcc0-73d6620d7b7a',
    'bb66cfa6-6d22-44c5-b5a9-a1ee6ad9f484',
    'be4a18f3-75b6-47b2-97bb-cbdbc65d8ca1',
    'd381d0d7-356a-439b-a32a-27a05a1e4dbf',
    '93244dfb-f837-437e-b01c-254ad0c64973',
    '371d3472-09be-4073-afe1-5600b50f6301',
    '05222a32-5c22-4f9e-92ff-37c1edfca646',
    'ff9e0e36-1efd-4854-9297-776b7a43df62',
    'de8bd040-a88f-4385-8400-6a27593f5008',
    '1349ef74-e584-4992-b64b-655d4854d44a',
    '72bde255-9fc4-4223-a120-38098b07be87',
    'fa76d557-e856-4408-8fbc-c55406553dc6',
    '933eed6d-db93-4e8a-804b-28c7e7e97eb3',
    'a8b11293-bf5d-43fb-86c3-8ae30eb12d7f',
    'b36ae534-e535-46a7-994b-994f95a0fc0b',
    '34735ab9-cb41-43c8-991f-0e4e98977166',
    'eac0a6dc-7171-4136-a1bb-b2c6d434b937',
    'de28513e-8ebc-4522-b6ad-fe7adfd2a4af',
    '07be982a-58e2-4717-b3e8-7db409506006',
    '958e4dba-81fb-4f4b-b70d-8bdd0f65d4cd',
    'dfc2615e-9412-4e4b-a7e5-11b2789dd71b',
    'cc411a05-d002-40d0-9782-df3837a9ad02',
    'e6b28aed-8646-4f33-857c-4fcde5c8c13a',
    '04f214d5-7b34-4c94-93d4-4ff34019fd97',
    '17d21bb0-4849-49dc-ab22-4fe7b476ff4e',
    '81bdfd7b-0164-4583-a77a-2a632a353cec',
    'ce148e83-6e24-486b-a033-8381a798187e',
    '752d733b-c9d9-493f-b827-31470d5f8b64',
    '833d2819-e023-47e3-bb38-073797d8b561',
    '889f10d2-83b3-4dc0-a566-6b10777f258a',
    '0344c2b4-5487-4acd-a33b-20100908e21c',
    '7cdb0a7f-c6bd-44e3-a7b6-039cba87aaae',
    'b695edd3-f6b1-4a6c-b216-03fb09721017',
    '7791187b-dde0-4d95-b7c0-11fb2593c261',
    '3b7a161d-9576-4552-8cd7-4df08354dbd6',
    'dbc431ac-c484-4dc5-9a6c-924a75a83b54',
    '1f2c1445-6fdb-41ce-b786-f003e43b02f7',
    'e43fe571-97ad-4f38-bee6-880829001350',
    '8901e3bb-484b-472b-8494-3248dfcb7059',
    'd1f26fdf-c2ac-437b-8f56-1b3e1491d6ef',
    '7700fc02-e0ce-4b68-8ac1-5c28a256ce6d',
    '20a52fa1-65b1-4370-a1a8-a236a81f2d8d',
    '99221131-8908-4039-a838-22d9baff9e48',
    'b97b3a65-65af-4e44-9220-88822f33293c',
    '0659ee26-e794-4828-aca2-6d0281de590b',
    '90bf7d3f-a312-45b3-8d89-642c7c5a1426',
    '4eac1374-dbbb-435a-bfe4-a8f43bdc18c4',
    '13eff5df-e5cf-479d-86c0-5894b7192728',
    '8aadf53d-7bac-4d9f-a4d8-c6e89a1498ca',
    '447215ed-9826-4a5f-9fd6-3ece521649a5'
 );

-- ---- admin_area_centroid: 9 rows
UPDATE municipal_project
   SET centroid = NULL,
       centroid_source = NULL,
       unplaced_reason = 'admin_area_centroid'
 WHERE id IN (
    'f5e49022-ecda-4d75-9daf-988034adec04',
    'f01767f3-e805-4b4e-b879-0ec0ed76f7d2',
    '9de80359-ad31-4100-a997-24fbf6d398b1',
    '7ca5581d-527d-4a85-8934-e5d131183363',
    'b7f3b263-10e7-4c7c-9929-01ea01f07ddd',
    '6e6117fd-0504-4fcf-b295-6bb852f534d2',
    '05bcc193-7cd7-4143-8b02-13a3d496a463',
    'cb76f9a3-3518-43b3-8602-838823604363',
    'accc65dd-e1ae-41b0-9729-6fae6c9ea56c'
 );

-- ---- road_centroid: 15 rows
UPDATE municipal_project
   SET centroid = NULL,
       centroid_source = NULL,
       unplaced_reason = 'road_centroid'
 WHERE id IN (
    '06f70c27-e341-4866-b479-8c323b57eb27',
    '2829ef63-928f-4dd0-ac64-5f759a1d2251',
    '3f3aa06d-c6b7-47b6-a740-424ad8a70e05',
    'd15ac138-4363-4e85-9d36-785cae06aa78',
    '57c4c5be-c126-48c7-9f46-6ebc72f1756e',
    '7f8e7172-8b93-4103-9f92-67b09dc12bfc',
    '6ca31ec2-8a11-4c17-a4d7-87e458d1ab84',
    'c2348a4c-8201-4a3e-bcfa-9b6063a1a6e8',
    'f6db6e23-9b9f-4059-a5ba-bd4ab9255c1c',
    'd034eff8-cf6e-4a1a-ba0c-4b73804e58ac',
    'bb9cb433-b049-49c3-8b79-21aec7d9f1f6',
    '7d0cd7a1-b5c1-483b-a168-b8302fe48b21',
    'd6d970a8-2e3d-45d0-8031-40b82f3583b2',
    '557125ed-1679-4158-a76e-ff50c6f88e7a',
    '506e58e2-925f-46b6-bd46-ad87965f3fd4'
 );

-- The placement invariant added by the previous migration enforces the rest: a
-- row now either has a centroid and a centroid_source, or has neither and carries
-- an unplaced_reason.
