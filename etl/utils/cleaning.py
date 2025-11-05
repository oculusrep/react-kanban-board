"""
Data cleaning and validation utilities for Restaurant Trends ETL.

Handles row dropping, null handling, and data quality validation.
"""

import pandas as pd
import logging
from typing import Tuple, List, Dict

logger = logging.getLogger(__name__)


class CleaningStats:
    """
    Tracks statistics about data cleaning operations.
    """

    def __init__(self):
        self.total_rows = 0
        self.empty_rows_dropped = 0
        self.null_store_no_dropped = 0
        self.invalid_coords_dropped = 0
        self.duplicate_rows_dropped = 0
        self.warnings = []

    def get_final_count(self) -> int:
        """Returns count of rows after cleaning."""
        return (self.total_rows -
                self.empty_rows_dropped -
                self.null_store_no_dropped -
                self.invalid_coords_dropped -
                self.duplicate_rows_dropped)

    def log_summary(self):
        """Logs a summary of cleaning operations."""
        logger.info("=" * 60)
        logger.info("DATA CLEANING SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total rows read:              {self.total_rows}")
        logger.info(f"Empty rows dropped:           {self.empty_rows_dropped}")
        logger.info(f"Null STORE_NO dropped:        {self.null_store_no_dropped}")
        logger.info(f"Invalid coordinates dropped:  {self.invalid_coords_dropped}")
        logger.info(f"Duplicate rows dropped:       {self.duplicate_rows_dropped}")
        logger.info(f"Final valid rows:             {self.get_final_count()}")
        logger.info("=" * 60)

        if self.warnings:
            logger.warning(f"Total warnings: {len(self.warnings)}")
            for warning in self.warnings[:10]:  # Show first 10 warnings
                logger.warning(f"  - {warning}")
            if len(self.warnings) > 10:
                logger.warning(f"  ... and {len(self.warnings) - 10} more warnings")


def drop_empty_rows(df: pd.DataFrame, stats: CleaningStats) -> pd.DataFrame:
    """
    Drops completely empty rows from DataFrame.

    Args:
        df (pd.DataFrame): Input DataFrame
        stats (CleaningStats): Statistics tracker

    Returns:
        pd.DataFrame: Cleaned DataFrame
    """
    initial_count = len(df)

    # Drop rows where all values are null
    df_cleaned = df.dropna(how='all')

    dropped_count = initial_count - len(df_cleaned)
    stats.empty_rows_dropped = dropped_count

    if dropped_count > 0:
        logger.info(f"Dropped {dropped_count} completely empty rows")

    return df_cleaned


def drop_null_store_no(df: pd.DataFrame, stats: CleaningStats) -> pd.DataFrame:
    """
    Drops rows where STORE_NO is null (required field).

    Args:
        df (pd.DataFrame): Input DataFrame
        stats (CleaningStats): Statistics tracker

    Returns:
        pd.DataFrame: Cleaned DataFrame
    """
    initial_count = len(df)

    # Check if STORE_NO column exists
    if 'STORE_NO' not in df.columns:
        logger.error("STORE_NO column not found in DataFrame!")
        stats.warnings.append("STORE_NO column missing from data")
        return df

    # Drop rows where STORE_NO is null or empty
    df_cleaned = df[df['STORE_NO'].notna() & (df['STORE_NO'] != '')]

    dropped_count = initial_count - len(df_cleaned)
    stats.null_store_no_dropped = dropped_count

    if dropped_count > 0:
        logger.warning(f"Dropped {dropped_count} rows with null STORE_NO")
        stats.warnings.append(f"{dropped_count} rows missing required STORE_NO field")

    return df_cleaned


def drop_duplicate_store_nos(df: pd.DataFrame, stats: CleaningStats) -> pd.DataFrame:
    """
    Drops duplicate STORE_NO rows, keeping first occurrence.

    Args:
        df (pd.DataFrame): Input DataFrame
        stats (CleaningStats): Statistics tracker

    Returns:
        pd.DataFrame: Cleaned DataFrame
    """
    initial_count = len(df)

    if 'STORE_NO' not in df.columns:
        return df

    # Find duplicates
    duplicates = df[df.duplicated(subset=['STORE_NO'], keep='first')]

    if len(duplicates) > 0:
        logger.warning(f"Found {len(duplicates)} duplicate STORE_NO values")
        # Log first few duplicate store numbers
        dup_stores = duplicates['STORE_NO'].unique()[:5]
        logger.warning(f"Example duplicates: {', '.join(map(str, dup_stores))}")
        stats.warnings.append(f"{len(duplicates)} duplicate STORE_NO values found")

    # Keep first occurrence of each STORE_NO
    df_cleaned = df.drop_duplicates(subset=['STORE_NO'], keep='first')

    dropped_count = initial_count - len(df_cleaned)
    stats.duplicate_rows_dropped = dropped_count

    return df_cleaned


def validate_required_columns(df: pd.DataFrame, required_columns: List[str]) -> Tuple[bool, List[str]]:
    """
    Validates that required columns exist in DataFrame.

    Args:
        df (pd.DataFrame): DataFrame to validate
        required_columns (list): List of required column names

    Returns:
        tuple: (is_valid, missing_columns)
    """
    missing = [col for col in required_columns if col not in df.columns]

    if missing:
        logger.error(f"Missing required columns: {', '.join(missing)}")
        return (False, missing)

    return (True, [])


def check_data_quality(df: pd.DataFrame, stats: CleaningStats) -> Dict[str, any]:
    """
    Performs data quality checks and logs warnings.

    Args:
        df (pd.DataFrame): DataFrame to check
        stats (CleaningStats): Statistics tracker

    Returns:
        dict: Quality metrics
    """
    metrics = {
        'total_rows': len(df),
        'null_percentages': {},
        'unique_stores': 0,
        'unique_chains': 0,
        'unique_states': 0,
    }

    # Calculate null percentages for key columns
    key_columns = ['STORE_NO', 'CHAIN', 'GEOSTATE', 'LATITUDE', 'LONGITUDE']
    for col in key_columns:
        if col in df.columns:
            null_count = df[col].isna().sum()
            null_pct = (null_count / len(df)) * 100 if len(df) > 0 else 0
            metrics['null_percentages'][col] = round(null_pct, 2)

            if null_pct > 10:  # Warn if more than 10% nulls
                msg = f"Column '{col}' has {null_pct:.1f}% null values"
                logger.warning(msg)
                stats.warnings.append(msg)

    # Count unique values
    if 'STORE_NO' in df.columns:
        metrics['unique_stores'] = df['STORE_NO'].nunique()

    if 'CHAIN' in df.columns:
        metrics['unique_chains'] = df['CHAIN'].nunique()
        logger.info(f"Data contains {metrics['unique_chains']} unique chains")

    if 'GEOSTATE' in df.columns:
        metrics['unique_states'] = df['GEOSTATE'].nunique()
        logger.info(f"Data contains {metrics['unique_states']} unique states")

    return metrics


def clean_excel_data(df: pd.DataFrame) -> Tuple[pd.DataFrame, CleaningStats]:
    """
    Main cleaning function - applies all cleaning operations.

    Args:
        df (pd.DataFrame): Raw DataFrame from Excel

    Returns:
        tuple: (cleaned_df, cleaning_stats)
    """
    stats = CleaningStats()
    stats.total_rows = len(df)

    logger.info(f"Starting data cleaning with {stats.total_rows} rows")

    # Step 1: Drop completely empty rows
    df = drop_empty_rows(df, stats)

    # Step 2: Drop rows with null STORE_NO (required field)
    df = drop_null_store_no(df, stats)

    # Step 3: Drop duplicate STORE_NO rows
    df = drop_duplicate_store_nos(df, stats)

    # Step 4: Data quality checks
    quality_metrics = check_data_quality(df, stats)

    # Log summary
    stats.log_summary()

    return df, stats


def validate_location_data(df: pd.DataFrame) -> bool:
    """
    Validates location DataFrame has required fields.

    Args:
        df (pd.DataFrame): Location DataFrame

    Returns:
        bool: True if valid, False otherwise
    """
    required = ['store_no']
    is_valid, missing = validate_required_columns(df, required)

    if not is_valid:
        logger.error(f"Location data validation failed: missing {missing}")

    return is_valid


def validate_trend_data(df: pd.DataFrame) -> bool:
    """
    Validates trend DataFrame has required fields.

    Args:
        df (pd.DataFrame): Trend DataFrame

    Returns:
        bool: True if valid, False otherwise
    """
    required = ['store_no', 'year']
    is_valid, missing = validate_required_columns(df, required)

    if not is_valid:
        logger.error(f"Trend data validation failed: missing {missing}")

    return is_valid
