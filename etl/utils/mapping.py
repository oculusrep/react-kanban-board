"""
Column mapping utilities for Restaurant Trends ETL.

Maps Excel column names to database field names for both restaurant_location
and restaurant_trend tables.
"""

# Excel column name → Database field name mapping
# Handles special characters in Excel headers (parentheses, slashes, etc.)

LOCATION_COLUMN_MAP = {
    'STORE_NO': 'store_no',
    'CHAIN_NO': 'chain_no',
    'CHAIN': 'chain',
    'GEOADDRESS': 'geoaddress',
    'GEOCITY': 'geocity',
    'GEOSTATE': 'geostate',
    'GEOZIP': 'geozip',
    'GEOZIP4': 'geozip4',
    'COUNTY': 'county',
    'DMA(MARKET)': 'dma_market',
    'DMA_NO': 'dma_no',
    'SEGMENT': 'segment',
    'SUBSEGMENT': 'subsegment',
    'CATEGORY': 'category',
    'LATITUDE': 'latitude',
    'LONGITUDE': 'longitude',
    'GEOQUALITY': 'geoquality',
    'YR_BUILT': 'yr_built',
    'CO/FR': 'co_fr',
    'CO/FR_NO': 'co_fr_no',
    'SEG_NO': 'seg_no',
}

TREND_COLUMN_MAP = {
    'STORE_NO': 'store_no',
    'YEAR': 'year',  # Added by ETL script from filename
    'CNG(CURR_NATL_GRADE)': 'curr_natl_grade',
    'CNI(CURR_NATL_INDEX)': 'curr_natl_index',
    'CURR_ANNUAL_SLS($000)': 'curr_annual_sls_k',
    'CMG(CURR_MKT_GRADE)': 'curr_mkt_grade',
    'LABEL(CNG/CMG)': 'label_cng_cmg',
    'LABEL(CNG<PNG)': 'label_cng_lt_png',
    'CMI(CURR_MKT_INDEX)': 'curr_mkt_index',
    'SURVEY_YR(LAST/C)': 'survey_yr_last_c',
    'SURVEY_YR(NEXT/C)': 'survey_yr_next_c',
    'TTL_NO_SURVEYS(C)': 'ttl_no_surveys_c',
    'PAST_YRS': 'past_yrs',
    'PNG(PAST_NATL_GRADE)': 'past_natl_grade',
    'LABEL(PNG)': 'label_png',
    'PNI(PAST_NATL_INDEX)': 'past_natl_index',
    'PAST_ANNUAL_SLS($000)': 'past_annual_sls_k',
    'PMG(PAST_MKT_GRADE)': 'past_mkt_grade',
    'LABEL(PNG/PMG)': 'label_png_pmg',
    'PMI(PAST_MKT_INDEX)': 'past_mkt_index',
    'SURVEY_YR(LAST/P)': 'survey_yr_last_p',
    'SURVEY_YR(NEXT/P)': 'survey_yr_next_p',
    'TTL_NO_SURVEYS(P)': 'ttl_no_surveys_p',
}


def get_location_columns():
    """
    Returns list of Excel column names that belong in restaurant_location table.

    Returns:
        list: Excel column names for location data
    """
    return list(LOCATION_COLUMN_MAP.keys())


def get_trend_columns():
    """
    Returns list of Excel column names that belong in restaurant_trend table.
    Note: YEAR is excluded as it's added programmatically from filename.

    Returns:
        list: Excel column names for trend data
    """
    # Exclude YEAR since it's added by the ETL script, not from Excel
    return [k for k in TREND_COLUMN_MAP.keys() if k != 'YEAR']


def map_location_columns(df):
    """
    Renames DataFrame columns for restaurant_location table.

    Args:
        df (pd.DataFrame): DataFrame with Excel column names

    Returns:
        pd.DataFrame: DataFrame with database column names
    """
    # Only rename columns that exist in the dataframe
    rename_dict = {k: v for k, v in LOCATION_COLUMN_MAP.items() if k in df.columns}
    return df.rename(columns=rename_dict)


def map_trend_columns(df):
    """
    Renames DataFrame columns for restaurant_trend table.

    Args:
        df (pd.DataFrame): DataFrame with Excel column names

    Returns:
        pd.DataFrame: DataFrame with database column names
    """
    # Only rename columns that exist in the dataframe
    rename_dict = {k: v for k, v in TREND_COLUMN_MAP.items() if k in df.columns}
    return df.rename(columns=rename_dict)


def validate_required_columns(df, required_columns):
    """
    Validates that all required columns exist in the DataFrame.

    Args:
        df (pd.DataFrame): DataFrame to validate
        required_columns (list): List of required column names

    Returns:
        tuple: (is_valid, missing_columns)
    """
    missing = [col for col in required_columns if col not in df.columns]
    return (len(missing) == 0, missing)


def get_all_excel_columns():
    """
    Returns complete list of all expected Excel columns.

    Returns:
        list: All Excel column names
    """
    # Combine all columns, removing duplicates (STORE_NO appears in both)
    all_cols = list(set(list(LOCATION_COLUMN_MAP.keys()) + list(TREND_COLUMN_MAP.keys())))
    return sorted(all_cols)
