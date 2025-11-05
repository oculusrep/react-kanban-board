#!/usr/bin/env python3
"""
Restaurant Trends ETL - Main Script

Processes yearly Excel files (YE##*.xlsx) and loads data into
restaurant_location and restaurant_trend PostgreSQL tables.

Usage:
    python etl/etl_restaurant_trends.py \\
        --in "data/incoming/YE24 Oculus SG.xlsx" \\
        --out data/processed \\
        --load [none|postgres]
"""

import argparse
import logging
import os
import sys
from pathlib import Path
import pandas as pd
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from etl.utils import mapping, parsing, cleaning
from etl.loaders.postgres_loader import PostgresLoader, test_connection


def setup_logging(log_level: str = 'INFO'):
    """
    Configure logging for ETL script.

    Args:
        log_level (str): Logging level (DEBUG, INFO, WARNING, ERROR)
    """
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )


def read_excel_file(file_path: str) -> pd.DataFrame:
    """
    Reads Excel file and returns DataFrame.

    Args:
        file_path (str): Path to Excel file

    Returns:
        pd.DataFrame: Raw data from first sheet
    """
    logger = logging.getLogger(__name__)
    logger.info(f"Reading Excel file: {file_path}")

    try:
        # Read first sheet only
        df = pd.read_excel(file_path, sheet_name=0)
        logger.info(f"Successfully read {len(df)} rows, {len(df.columns)} columns")
        return df
    except Exception as e:
        logger.error(f"Failed to read Excel file: {e}")
        raise


def split_location_and_trend_data(df: pd.DataFrame, year: int) -> tuple:
    """
    Splits cleaned data into location and trend DataFrames.

    Args:
        df (pd.DataFrame): Cleaned DataFrame with Excel column names
        year (int): Year to add to trend data

    Returns:
        tuple: (location_df, trend_df)
    """
    logger = logging.getLogger(__name__)

    # Extract location columns
    location_cols = mapping.get_location_columns()
    location_df = df[location_cols].copy()

    # Extract trend columns
    trend_cols = mapping.get_trend_columns()
    trend_df = df[trend_cols].copy()

    # Add year to trend data
    trend_df['YEAR'] = year

    # Drop duplicates from location data (keep first occurrence)
    location_df = location_df.drop_duplicates(subset=['STORE_NO'], keep='first')

    logger.info(f"Split data: {len(location_df)} unique locations, {len(trend_df)} trend records")

    return location_df, trend_df


def apply_column_mapping_and_types(location_df: pd.DataFrame, trend_df: pd.DataFrame) -> tuple:
    """
    Applies column name mapping and type coercion to both DataFrames.

    Args:
        location_df (pd.DataFrame): Location DataFrame with Excel column names
        trend_df (pd.DataFrame): Trend DataFrame with Excel column names

    Returns:
        tuple: (location_df, trend_df) with database column names and types
    """
    logger = logging.getLogger(__name__)
    logger.info("Applying column mappings and type coercion")

    # Rename columns to database field names
    location_df = mapping.map_location_columns(location_df)
    trend_df = mapping.map_trend_columns(trend_df)

    # Coerce numeric columns
    location_df = parsing.coerce_numeric_columns(
        location_df,
        parsing.get_numeric_location_columns()
    )
    location_df = parsing.coerce_integer_columns(
        location_df,
        parsing.get_integer_location_columns()
    )

    trend_df = parsing.coerce_numeric_columns(
        trend_df,
        parsing.get_numeric_trend_columns()
    )
    trend_df = parsing.coerce_integer_columns(
        trend_df,
        parsing.get_integer_trend_columns()
    )

    # Validate location and trend data
    if not cleaning.validate_location_data(location_df):
        raise ValueError("Location data validation failed")

    if not cleaning.validate_trend_data(trend_df):
        raise ValueError("Trend data validation failed")

    return location_df, trend_df


def export_to_csv(location_df: pd.DataFrame, trend_df: pd.DataFrame,
                  output_dir: str, base_name: str, year: int):
    """
    Exports DataFrames to CSV files.

    Args:
        location_df (pd.DataFrame): Location data
        trend_df (pd.DataFrame): Trend data
        output_dir (str): Output directory path
        base_name (str): Base filename
        year (int): Year for filename
    """
    logger = logging.getLogger(__name__)

    # Create output directory if it doesn't exist
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Build filenames
    location_file = os.path.join(output_dir, f"{base_name}_{year}_locations.csv")
    trend_file = os.path.join(output_dir, f"{base_name}_{year}_trends.csv")

    # Export to CSV
    location_df.to_csv(location_file, index=False)
    logger.info(f"Exported location data to: {location_file}")

    trend_df.to_csv(trend_file, index=False)
    logger.info(f"Exported trend data to: {trend_file}")


def load_to_database(location_df: pd.DataFrame, trend_df: pd.DataFrame,
                     connection_string: str = None):
    """
    Loads data to PostgreSQL database.

    Args:
        location_df (pd.DataFrame): Location data
        trend_df (pd.DataFrame): Trend data
        connection_string (str, optional): Database connection string
    """
    logger = logging.getLogger(__name__)
    logger.info("Loading data to PostgreSQL database")

    try:
        with PostgresLoader(connection_string) as loader:
            # Load locations first (referenced by trends)
            loc_inserted, loc_updated = loader.upsert_locations(location_df)
            logger.info(f"Locations upserted: {loc_inserted + loc_updated} total")

            # Verify foreign keys before loading trends
            fk_valid, missing = loader.verify_foreign_keys(trend_df)
            if not fk_valid:
                raise ValueError(
                    f"Cannot load trends: {len(missing)} store_nos not found in location table"
                )

            # Load trends
            trend_inserted, trend_updated = loader.upsert_trends(trend_df)
            logger.info(f"Trends upserted: {trend_inserted + trend_updated} total")

            # Get final stats
            stats = loader.get_load_stats()
            logger.info(f"Database load complete. Stats: {stats}")

    except Exception as e:
        logger.error(f"Database load failed: {e}")
        raise


def main():
    """Main ETL execution function."""
    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description='Restaurant Trends ETL - Process Excel files and load to database'
    )
    parser.add_argument(
        '--in',
        dest='input_file',
        required=True,
        help='Path to input Excel file (e.g., data/incoming/YE24 Oculus SG.xlsx)'
    )
    parser.add_argument(
        '--out',
        dest='output_dir',
        required=True,
        help='Directory for output CSV files (e.g., data/processed)'
    )
    parser.add_argument(
        '--load',
        dest='load_mode',
        choices=['none', 'postgres'],
        default='none',
        help='Database loading mode: none (CSV only) or postgres (CSV + DB load)'
    )
    parser.add_argument(
        '--log-level',
        dest='log_level',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help='Logging level (default: INFO)'
    )

    args = parser.parse_args()

    # Setup logging
    setup_logging(args.log_level)
    logger = logging.getLogger(__name__)

    logger.info("=" * 80)
    logger.info("RESTAURANT TRENDS ETL - STARTING")
    logger.info("=" * 80)
    logger.info(f"Input file: {args.input_file}")
    logger.info(f"Output dir: {args.output_dir}")
    logger.info(f"Load mode: {args.load_mode}")

    start_time = datetime.now()

    try:
        # Step 1: Extract year from filename
        year = parsing.extract_year_from_filename(args.input_file)
        if year is None:
            raise ValueError(
                f"Could not extract year from filename: {args.input_file}. "
                "Expected pattern: YE##*.xlsx"
            )

        # Step 2: Read Excel file
        df_raw = read_excel_file(args.input_file)

        # Step 3: Clean data
        df_clean, clean_stats = cleaning.clean_excel_data(df_raw)

        if len(df_clean) == 0:
            raise ValueError("No valid data after cleaning. Cannot proceed.")

        # Step 4: Split into location and trend data
        location_df, trend_df = split_location_and_trend_data(df_clean, year)

        # Step 5: Apply column mapping and type coercion
        location_df, trend_df = apply_column_mapping_and_types(location_df, trend_df)

        # Step 6: Export to CSV
        base_name = Path(args.input_file).stem  # filename without extension
        export_to_csv(location_df, trend_df, args.output_dir, base_name, year)

        # Step 7: Load to database (if requested)
        if args.load_mode == 'postgres':
            load_to_database(location_df, trend_df)
        else:
            logger.info("Skipping database load (mode: none)")

        # Success!
        elapsed = datetime.now() - start_time
        logger.info("=" * 80)
        logger.info("ETL COMPLETED SUCCESSFULLY")
        logger.info(f"Processed {len(location_df)} locations, {len(trend_df)} trend records")
        logger.info(f"Year: {year}")
        logger.info(f"Elapsed time: {elapsed.total_seconds():.2f} seconds")
        logger.info("=" * 80)

        return 0

    except Exception as e:
        logger.error("=" * 80)
        logger.error("ETL FAILED")
        logger.error(f"Error: {e}")
        logger.error("=" * 80)
        return 1


if __name__ == '__main__':
    sys.exit(main())
