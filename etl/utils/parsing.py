"""
Parsing utilities for Restaurant Trends ETL.

Handles year extraction from filenames and data type coercion.
"""

import re
import os
from typing import Optional, Any
import pandas as pd
import logging

logger = logging.getLogger(__name__)


def extract_year_from_filename(filename: str) -> Optional[int]:
    """
    Extracts year from Excel filename pattern YE##*.xlsx.

    Examples:
        'YE24 Oculus SG.xlsx' → 2024
        'YE19 O\\'Brien SG.xlsx' → 2019
        'YE15_Data.xlsx' → 2015

    Args:
        filename (str): Filename or full path to Excel file

    Returns:
        Optional[int]: 4-digit year, or None if pattern not found
    """
    # Get just the filename without path
    basename = os.path.basename(filename)

    # Extract YE## pattern (e.g., YE24 → 24)
    pattern = r'^YE(\d{2})'
    match = re.match(pattern, basename, re.IGNORECASE)

    if match:
        two_digit_year = int(match.group(1))
        # Convert to 4-digit year (YE24 → 2024, YE15 → 2015)
        four_digit_year = 2000 + two_digit_year
        logger.info(f"Extracted year {four_digit_year} from filename: {basename}")
        return four_digit_year
    else:
        logger.warning(f"Could not extract year from filename: {basename}")
        return None


def coerce_to_numeric(value: Any, allow_null: bool = True) -> Optional[float]:
    """
    Safely converts value to numeric (float), handling nulls and errors.

    Args:
        value: Value to convert
        allow_null (bool): If True, returns None for null values; if False, returns 0

    Returns:
        Optional[float]: Numeric value, None, or 0
    """
    if pd.isna(value) or value == '' or value is None:
        return None if allow_null else 0.0

    try:
        return float(value)
    except (ValueError, TypeError):
        logger.debug(f"Could not convert '{value}' to numeric, returning None")
        return None if allow_null else 0.0


def coerce_to_integer(value: Any, allow_null: bool = True) -> Optional[int]:
    """
    Safely converts value to integer, handling nulls and errors.

    Args:
        value: Value to convert
        allow_null (bool): If True, returns None for null values; if False, returns 0

    Returns:
        Optional[int]: Integer value, None, or 0
    """
    if pd.isna(value) or value == '' or value is None:
        return None if allow_null else 0

    try:
        # Convert to float first to handle decimals, then to int
        return int(float(value))
    except (ValueError, TypeError):
        logger.debug(f"Could not convert '{value}' to integer, returning None")
        return None if allow_null else 0


def coerce_to_text(value: Any, allow_null: bool = True) -> Optional[str]:
    """
    Safely converts value to text string, handling nulls.

    Args:
        value: Value to convert
        allow_null (bool): If True, returns None for null values; if False, returns ''

    Returns:
        Optional[str]: String value, None, or ''
    """
    if pd.isna(value) or value is None:
        return None if allow_null else ''

    return str(value).strip()


def coerce_numeric_columns(df: pd.DataFrame, numeric_columns: list) -> pd.DataFrame:
    """
    Applies numeric coercion to specified DataFrame columns.

    Args:
        df (pd.DataFrame): DataFrame to process
        numeric_columns (list): List of column names to coerce to numeric

    Returns:
        pd.DataFrame: DataFrame with coerced columns
    """
    for col in numeric_columns:
        if col in df.columns:
            df[col] = df[col].apply(lambda x: coerce_to_numeric(x))
            logger.debug(f"Coerced column '{col}' to numeric")

    return df


def coerce_integer_columns(df: pd.DataFrame, integer_columns: list) -> pd.DataFrame:
    """
    Applies integer coercion to specified DataFrame columns.

    Args:
        df (pd.DataFrame): DataFrame to process
        integer_columns (list): List of column names to coerce to integer

    Returns:
        pd.DataFrame: DataFrame with coerced columns
    """
    for col in integer_columns:
        if col in df.columns:
            df[col] = df[col].apply(lambda x: coerce_to_integer(x))
            logger.debug(f"Coerced column '{col}' to integer")

    return df


def get_numeric_location_columns():
    """
    Returns list of location columns that should be numeric.

    Returns:
        list: Column names (database field names, not Excel names)
    """
    return [
        'latitude',
        'longitude',
        'verified_latitude',
        'verified_longitude',
    ]


def get_integer_location_columns():
    """
    Returns list of location columns that should be integer.

    Returns:
        list: Column names (database field names, not Excel names)
    """
    return [
        'yr_built',
    ]


def get_numeric_trend_columns():
    """
    Returns list of trend columns that should be numeric (float).

    Returns:
        list: Column names (database field names, not Excel names)
    """
    return [
        'curr_natl_index',
        'curr_annual_sls_k',
        'curr_mkt_index',
        'past_natl_index',
        'past_annual_sls_k',
        'past_mkt_index',
    ]


def get_integer_trend_columns():
    """
    Returns list of trend columns that should be integer.

    Returns:
        list: Column names (database field names, not Excel names)
    """
    return [
        'year',
        'survey_yr_last_c',
        'survey_yr_next_c',
        'ttl_no_surveys_c',
        'past_yrs',
        'survey_yr_last_p',
        'survey_yr_next_p',
        'ttl_no_surveys_p',
    ]


def validate_coordinate_range(lat: Optional[float], lon: Optional[float]) -> bool:
    """
    Validates that latitude and longitude are within valid ranges.

    Args:
        lat: Latitude value
        lon: Longitude value

    Returns:
        bool: True if coordinates are valid or None, False otherwise
    """
    if lat is None or lon is None:
        return True  # Allow null coordinates

    if not (-90 <= lat <= 90):
        logger.warning(f"Invalid latitude: {lat} (must be between -90 and 90)")
        return False

    if not (-180 <= lon <= 180):
        logger.warning(f"Invalid longitude: {lon} (must be between -180 and 180)")
        return False

    return True
