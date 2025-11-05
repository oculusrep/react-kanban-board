"""
PostgreSQL database loader for Restaurant Trends ETL.

Handles database connections and upsert operations for both
restaurant_location and restaurant_trend tables.
"""

import psycopg2
from psycopg2.extras import execute_values
import pandas as pd
import logging
from typing import Optional, Dict, Tuple
import os

logger = logging.getLogger(__name__)


class PostgresLoader:
    """
    Manages PostgreSQL database connections and data loading operations.
    """

    def __init__(self, connection_string: Optional[str] = None):
        """
        Initialize loader with database connection.

        Args:
            connection_string (str, optional): PostgreSQL connection string.
                If not provided, will try to read from DATABASE_URL env var.
        """
        self.connection_string = connection_string or os.getenv('DATABASE_URL')

        if not self.connection_string:
            raise ValueError(
                "No database connection string provided. "
                "Set DATABASE_URL environment variable or pass connection_string parameter."
            )

        self.conn = None
        self.cursor = None

    def connect(self):
        """Establishes database connection."""
        try:
            self.conn = psycopg2.connect(self.connection_string)
            self.cursor = self.conn.cursor()
            logger.info("Successfully connected to PostgreSQL database")
        except psycopg2.Error as e:
            logger.error(f"Failed to connect to database: {e}")
            raise

    def close(self):
        """Closes database connection."""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")

    def __enter__(self):
        """Context manager entry."""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        if exc_type is not None:
            self.conn.rollback()
            logger.error(f"Transaction rolled back due to error: {exc_val}")
        self.close()

    def upsert_locations(self, df: pd.DataFrame) -> Tuple[int, int]:
        """
        Upserts restaurant location data.

        Uses ON CONFLICT to update existing records or insert new ones.
        Updates all fields when newer data is loaded.

        Args:
            df (pd.DataFrame): Location data with database column names

        Returns:
            tuple: (inserted_count, updated_count)
        """
        if df.empty:
            logger.warning("Empty DataFrame provided for location upsert")
            return (0, 0)

        # Ensure store_no exists
        if 'store_no' not in df.columns:
            raise ValueError("DataFrame must contain 'store_no' column")

        # Convert DataFrame to list of tuples
        columns = df.columns.tolist()
        values = [tuple(row) for row in df.values]

        # Build column list for INSERT
        col_list = ', '.join(columns)

        # Build placeholders for VALUES
        placeholders = ', '.join(['%s'] * len(columns))

        # Build UPDATE clause (update all columns except store_no)
        update_cols = [col for col in columns if col != 'store_no' and col != 'created_at']
        update_clause = ', '.join([f"{col} = EXCLUDED.{col}" for col in update_cols])

        # SQL with ON CONFLICT
        sql = f"""
            INSERT INTO restaurant_location ({col_list})
            VALUES %s
            ON CONFLICT (store_no) DO UPDATE SET
                {update_clause}
        """

        try:
            # Execute batch insert
            execute_values(self.cursor, sql, values, template=f"({placeholders})")
            self.conn.commit()

            rows_affected = self.cursor.rowcount
            logger.info(f"Upserted {rows_affected} location records")

            # Note: Can't easily distinguish between inserts and updates with execute_values
            # Returning total affected rows
            return (rows_affected, 0)

        except psycopg2.Error as e:
            self.conn.rollback()
            logger.error(f"Failed to upsert locations: {e}")
            raise

    def upsert_trends(self, df: pd.DataFrame) -> Tuple[int, int]:
        """
        Upserts restaurant trend data.

        Uses ON CONFLICT (store_no, year) to update existing records or insert new ones.

        Args:
            df (pd.DataFrame): Trend data with database column names

        Returns:
            tuple: (inserted_count, updated_count)
        """
        if df.empty:
            logger.warning("Empty DataFrame provided for trend upsert")
            return (0, 0)

        # Ensure required columns exist
        required = ['store_no', 'year']
        missing = [col for col in required if col not in df.columns]
        if missing:
            raise ValueError(f"DataFrame missing required columns: {missing}")

        # Remove trend_id if present (will be auto-generated)
        if 'trend_id' in df.columns:
            df = df.drop(columns=['trend_id'])

        # Convert DataFrame to list of tuples
        columns = df.columns.tolist()
        values = [tuple(row) for row in df.values]

        # Build column list for INSERT
        col_list = ', '.join(columns)

        # Build placeholders for VALUES
        placeholders = ', '.join(['%s'] * len(columns))

        # Build UPDATE clause (update all columns except store_no, year, trend_id, created_at)
        update_cols = [col for col in columns if col not in ['store_no', 'year', 'trend_id', 'created_at']]
        update_clause = ', '.join([f"{col} = EXCLUDED.{col}" for col in update_cols])

        # SQL with ON CONFLICT
        sql = f"""
            INSERT INTO restaurant_trend ({col_list})
            VALUES %s
            ON CONFLICT (store_no, year) DO UPDATE SET
                {update_clause}
        """

        try:
            # Execute batch insert
            execute_values(self.cursor, sql, values, template=f"({placeholders})")
            self.conn.commit()

            rows_affected = self.cursor.rowcount
            logger.info(f"Upserted {rows_affected} trend records")

            return (rows_affected, 0)

        except psycopg2.Error as e:
            self.conn.rollback()
            logger.error(f"Failed to upsert trends: {e}")
            raise

    def verify_foreign_keys(self, trend_df: pd.DataFrame) -> Tuple[bool, list]:
        """
        Verifies that all store_no values in trend data exist in location table.

        Args:
            trend_df (pd.DataFrame): Trend data to verify

        Returns:
            tuple: (all_valid, missing_store_nos)
        """
        if trend_df.empty:
            return (True, [])

        store_nos = trend_df['store_no'].unique().tolist()

        # Query database for existing store_nos
        placeholders = ', '.join(['%s'] * len(store_nos))
        sql = f"""
            SELECT store_no FROM restaurant_location
            WHERE store_no IN ({placeholders})
        """

        try:
            self.cursor.execute(sql, store_nos)
            existing = {row[0] for row in self.cursor.fetchall()}

            # Find missing store_nos
            missing = [sn for sn in store_nos if sn not in existing]

            if missing:
                logger.error(f"Found {len(missing)} store_nos not in location table")
                logger.error(f"Missing store_nos: {missing[:10]}")  # Show first 10
                return (False, missing)

            return (True, [])

        except psycopg2.Error as e:
            logger.error(f"Failed to verify foreign keys: {e}")
            raise

    def get_load_stats(self) -> Dict[str, int]:
        """
        Gets statistics about loaded data.

        Returns:
            dict: Statistics including row counts for each table
        """
        stats = {}

        try:
            # Count locations
            self.cursor.execute("SELECT COUNT(*) FROM restaurant_location")
            stats['total_locations'] = self.cursor.fetchone()[0]

            # Count trends
            self.cursor.execute("SELECT COUNT(*) FROM restaurant_trend")
            stats['total_trends'] = self.cursor.fetchone()[0]

            # Count locations with verified coordinates
            self.cursor.execute("""
                SELECT COUNT(*) FROM restaurant_location
                WHERE verified_latitude IS NOT NULL AND verified_longitude IS NOT NULL
            """)
            stats['locations_with_verified_coords'] = self.cursor.fetchone()[0]

            # Get year range
            self.cursor.execute("""
                SELECT MIN(year), MAX(year) FROM restaurant_trend
            """)
            min_year, max_year = self.cursor.fetchone()
            stats['year_range'] = f"{min_year}-{max_year}" if min_year and max_year else "No data"

            logger.info(f"Database stats: {stats}")
            return stats

        except psycopg2.Error as e:
            logger.error(f"Failed to get load stats: {e}")
            return {}


def test_connection(connection_string: Optional[str] = None) -> bool:
    """
    Tests database connection.

    Args:
        connection_string (str, optional): Connection string to test

    Returns:
        bool: True if connection successful, False otherwise
    """
    try:
        with PostgresLoader(connection_string) as loader:
            logger.info("Database connection test successful")
            return True
    except Exception as e:
        logger.error(f"Database connection test failed: {e}")
        return False
