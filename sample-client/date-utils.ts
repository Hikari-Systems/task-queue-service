/**
 * Utility functions for converting date strings to Date objects
 * when receiving data from REST APIs
 */

/**
 * Converts a single date string to a Date object if it's a valid string
 * @param dateValue - The value to convert (string, Date, or other)
 * @returns Date object if input was a valid date string, otherwise returns the original value
 */
export const convertSingleDateField = (dateValue: any): any => {
  if (dateValue && typeof dateValue === 'string') {
    const date = new Date(dateValue);
    // Check if the date is valid
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return dateValue;
};

/**
 * Converts date strings to Date objects for Timestamped objects
 * @param obj - Object that may have createdAt and updatedAt fields
 * @returns Object with date strings converted to Date objects
 */
export const convertTimestampedDates = (obj: any): any => {
  const converted = { ...obj };
  converted.createdAt = convertSingleDateField(converted.createdAt);
  converted.updatedAt = convertSingleDateField(converted.updatedAt);
  return converted;
};

/**
 * Converts date strings to Date objects for UserTermsAcceptance objects
 * @param obj - Object that may have acceptedAt field
 * @returns Object with date strings converted to Date objects
 */
export const convertUserTermsAcceptanceDates = (obj: any): any => {
  const converted = { ...obj };
  converted.acceptedAt = convertSingleDateField(converted.acceptedAt);
  return converted;
};

/**
 * Converts date strings to Date objects for AccessRequest objects
 * @param obj - Object that may have grantedFrom and grantedUntil fields
 * @returns Object with date strings converted to Date objects
 */
export const convertAccessRequestDates = (obj: any): any => {
  const converted = { ...obj };
  converted.grantedFrom = convertSingleDateField(converted.grantedFrom);
  converted.grantedUntil = convertSingleDateField(converted.grantedUntil);
  return converted;
};

/**
 * Converts date strings to Date objects for TaskLog objects
 * @param obj - Object that may have startedAt and endedAt fields
 * @returns Object with date strings converted to Date objects
 */
export const convertTaskLogDates = (obj: any): any => {
  const converted = { ...obj };
  converted.startedAt = convertSingleDateField(converted.startedAt);
  converted.endedAt = convertSingleDateField(converted.endedAt);
  return converted;
};

/**
 * Generic function to convert date strings in an array of objects
 * @param array - Array of objects to convert
 * @param converter - Function to convert each object
 * @returns Array with converted objects
 */
export const convertArrayDates = <T>(
  array: any[],
  converter: (obj: any) => T,
): T[] => (array || []).map(converter);
