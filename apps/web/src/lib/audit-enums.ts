// Audit enum mappings - mirrors the Solidity enums
// Used to convert between human-readable strings and contract enum values

// ─── V2 Contract Enums (AuditRegistry.sol) ────────────────────────────────

/// @notice GL-level payment categories — matches AuditRegistry.Category enum exactly.
export const Category = {
    OPEX:          0, // Operating expenses (supplies, utilities, general)
    CAPEX:         1, // Capital expenditure (equipment, property)
    PAYROLL:       2, // Salary, wages, benefits
    PROFESSIONAL:  3, // Consulting, legal, advisory services
    INTERCOMPANY:  4, // Related party / intra-group transfers
    TAX:           5, // Tax payments to authorities
    DEBT_SERVICE:  6, // Loan repayments, interest
    OTHER:         7, // Unclassified
} as const;

export type CategoryValue = typeof Category[keyof typeof Category];

export const CATEGORY_LABELS: Record<number, string> = {
    0: "OPEX",
    1: "CAPEX",
    2: "PAYROLL",
    3: "PROFESSIONAL",
    4: "INTERCOMPANY",
    5: "TAX",
    6: "DEBT_SERVICE",
    7: "OTHER",
};

export const CATEGORY_MAP: Record<string, number> = {
    "": 0,
    "OPEX": 0,
    "CAPEX": 1,
    "PAYROLL": 2,
    "PROFESSIONAL": 3,
    "INTERCOMPANY": 4,
    "TAX": 5,
    "DEBT_SERVICE": 6,
    "OTHER": 7,
};

export function getCategoryOptions(): { value: string; label: string }[] {
    return [
        { value: "OPEX",         label: "Operating Expenses (OPEX)" },
        { value: "CAPEX",        label: "Capital Expenditure (CAPEX)" },
        { value: "PAYROLL",      label: "Payroll & Benefits" },
        { value: "PROFESSIONAL", label: "Professional Services" },
        { value: "INTERCOMPANY", label: "Intercompany Transfer" },
        { value: "TAX",          label: "Tax Payment" },
        { value: "DEBT_SERVICE", label: "Debt Service" },
        { value: "OTHER",        label: "Other" },
    ];
}

export function stringToCategory(category: string | undefined): number {
    if (!category) return Category.OTHER;
    return CATEGORY_MAP[category] ?? Category.OTHER;
}

// ─── V1 Legacy Enums (kept for contact store backward compatibility) ────────

// Jurisdiction risk-region codes (must match AuditRegistry.JurisdictionCode)
export const JurisdictionCode = {
    DOMESTIC: 0,
    FATF_COMPLIANT: 1,
    FATF_GREY: 2,
    HIGH_RISK: 3,
    SANCTIONED: 4,
} as const;

// ISO 20022-derived payment purpose codes (must match AuditRegistry.PurposeCode)
export const PurposeCode = {
    GDDS: 0,
    SVCS: 1,
    SALA: 2,
    SUPP: 3,
    CONS: 4,
    REBT: 5,
    RENT: 6,
    TAXS: 7,
    INTC: 8,
    LOAN: 9,
    INVS: 10,
    OTHR: 11,
} as const;

// RiskTier enum values (must match AuditRegistry.RiskTier)
export const RiskTier = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    WATCHLIST: 3,
} as const;

// CounterpartyType enum values (must match AuditRegistry.CounterpartyType)
export const CounterpartyType = {
    VENDOR: 0,
    CONTRACTOR: 1,
    EMPLOYEE: 2,
    INTERCOMPANY: 3,
    GOVERNMENT: 4,
} as const;

export type JurisdictionCodeValue = typeof JurisdictionCode[keyof typeof JurisdictionCode];
export type PurposeCodeValue = typeof PurposeCode[keyof typeof PurposeCode];
export type RiskTierValue = typeof RiskTier[keyof typeof RiskTier];
export type CounterpartyTypeValue = typeof CounterpartyType[keyof typeof CounterpartyType];

// String to enum conversion maps
export const JURISDICTION_CODE_MAP: Record<string, number> = {
    "": 0,
    "none": 0,
    "DOMESTIC": 0,
    "FATF_COMPLIANT": 1,
    "FATF_GREY": 2,
    "HIGH_RISK": 3,
    "SANCTIONED": 4,
};

export const PURPOSE_CODE_MAP: Record<string, number> = {
    "": 0,
    "none": 0,
    "GDDS": 0,
    "SVCS": 1,
    "SALA": 2,
    "SUPP": 3,
    "CONS": 4,
    "REBT": 5,
    "RENT": 6,
    "TAXS": 7,
    "INTC": 8,
    "LOAN": 9,
    "INVS": 10,
    "OTHR": 11,
};

export const RISK_TIER_MAP: Record<string, number> = {
    "": 0,
    "none": 0,
    "LOW": 0,
    "MEDIUM": 1,
    "HIGH": 2,
    "WATCHLIST": 3,
};

export const COUNTERPARTY_TYPE_MAP: Record<string, number> = {
    "": 0,
    "none": 0,
    "VENDOR": 0,
    "CONTRACTOR": 1,
    "EMPLOYEE": 2,
    "INTERCOMPANY": 3,
    "GOVERNMENT": 4,
};

// Reverse maps for display purposes
export const JURISDICTION_CODE_LABELS: Record<number, string> = {
    0: "DOMESTIC",
    1: "FATF_COMPLIANT",
    2: "FATF_GREY",
    3: "HIGH_RISK",
    4: "SANCTIONED",
};

export const PURPOSE_CODE_LABELS: Record<number, string> = {
    0: "GDDS",
    1: "SVCS",
    2: "SALA",
    3: "SUPP",
    4: "CONS",
    5: "REBT",
    6: "RENT",
    7: "TAXS",
    8: "INTC",
    9: "LOAN",
    10: "INVS",
    11: "OTHR",
};

export const RISK_TIER_LABELS: Record<number, string> = {
    0: "LOW",
    1: "MEDIUM",
    2: "HIGH",
    3: "WATCHLIST",
};

export const COUNTERPARTY_TYPE_LABELS: Record<number, string> = {
    0: "VENDOR",
    1: "CONTRACTOR",
    2: "EMPLOYEE",
    3: "INTERCOMPANY",
    4: "GOVERNMENT",
};

// Human-readable labels for UI display
export const JURISDICTION_CODE_DISPLAY: Record<number, string> = {
    0: "Domestic (Local)",
    1: "FATF Compliant",
    2: "FATF Grey-listed",
    3: "High-Risk Center",
    4: "Sanctioned Territory",
};

export const PURPOSE_CODE_DISPLAY: Record<number, string> = {
    0: "Goods (GDDS)",
    1: "Services (SVCS)",
    2: "Payroll (SALA)",
    3: "Supplier (SUPP)",
    4: "Consulting (CONS)",
    5: "Rebate/Refund (REBT)",
    6: "Rent/Lease (RENT)",
    7: "Taxes (TAXS)",
    8: "Intra-company (INTC)",
    9: "Loan (LOAN)",
    10: "Investment (INVS)",
    11: "Other (OTHR)",
};

export const RISK_TIER_DISPLAY: Record<number, string> = {
    0: "Low",
    1: "Medium",
    2: "High",
    3: "Watchlist",
};

export const COUNTERPARTY_TYPE_DISPLAY: Record<number, string> = {
    0: "Vendor",
    1: "Contractor",
    2: "Employee",
    3: "Intercompany",
    4: "Government",
};

/**
 * Convert a jurisdiction code string to enum value
 * @param jurisdictionCode - String like "DOMESTIC", "FATF_COMPLIANT", etc.
 * @returns Enum value (number)
 */
export function stringToJurisdictionCode(jurisdictionCode: string | undefined): number {
    if (!jurisdictionCode) return JurisdictionCode.DOMESTIC;
    return JURISDICTION_CODE_MAP[jurisdictionCode] ?? JurisdictionCode.DOMESTIC;
}

/**
 * Convert a purpose code string to enum value
 * @param purposeCode - String like "GDDS", "SALA", etc.
 * @returns Enum value (number)
 */
export function stringToPurposeCode(purposeCode: string | undefined): number {
    if (!purposeCode) return PurposeCode.GDDS;
    return PURPOSE_CODE_MAP[purposeCode] ?? PurposeCode.GDDS;
}

/**
 * Convert a risk tier string to enum value
 * @param riskTier - String like "LOW", "MEDIUM", etc.
 * @returns Enum value (number)
 */
export function stringToRiskTier(riskTier: string | undefined): number {
    if (!riskTier) return RiskTier.LOW;
    return RISK_TIER_MAP[riskTier] ?? RiskTier.LOW;
}

/**
 * Convert a counterparty type string to enum value
 * @param counterpartyType - String like "VENDOR", "EMPLOYEE", etc.
 * @returns Enum value (number)
 */
export function stringToCounterpartyType(counterpartyType: string | undefined): number {
    if (!counterpartyType) return CounterpartyType.VENDOR;
    return COUNTERPARTY_TYPE_MAP[counterpartyType] ?? CounterpartyType.VENDOR;
}

/**
 * Convert arrays of jurisdiction code strings to enum values
 * @param jurisdictionCodes - Array of jurisdiction strings
 * @returns Array of enum values
 */
export function stringsToJurisdictionCodes(jurisdictionCodes: (string | undefined)[]): number[] {
    return jurisdictionCodes.map(j => stringToJurisdictionCode(j));
}

/**
 * Convert arrays of purpose code strings to enum values
 * @param purposeCodes - Array of purpose code strings
 * @returns Array of enum values
 */
export function stringsToPurposeCodes(purposeCodes: (string | undefined)[]): number[] {
    return purposeCodes.map(c => stringToPurposeCode(c));
}

/**
 * Convert arrays of risk tier strings to enum values
 * @param riskTiers - Array of risk tier strings
 * @returns Array of enum values
 */
export function stringsToRiskTiers(riskTiers: (string | undefined)[]): number[] {
    return riskTiers.map(rt => stringToRiskTier(rt));
}

/**
 * Convert arrays of counterparty type strings to enum values
 * @param counterpartyTypes - Array of counterparty type strings
 * @returns Array of enum values
 */
export function stringsToCounterpartyTypes(counterpartyTypes: (string | undefined)[]): number[] {
    return counterpartyTypes.map(ct => stringToCounterpartyType(ct));
}

/**
 * Convert enum value to jurisdiction code string
 * @param value - Enum value
 * @returns String like "DOMESTIC"
 */
export function jurisdictionCodeToString(value: number): string {
    return JURISDICTION_CODE_LABELS[value] ?? "";
}

/**
 * Convert enum value to purpose code string
 * @param value - Enum value
 * @returns String like "GDDS"
 */
export function purposeCodeToString(value: number): string {
    return PURPOSE_CODE_LABELS[value] ?? "";
}

/**
 * Convert enum value to risk tier string
 * @param value - Enum value
 * @returns String like "LOW"
 */
export function riskTierToString(value: number): string {
    return RISK_TIER_LABELS[value] ?? "LOW";
}

/**
 * Convert enum value to counterparty type string
 * @param value - Enum value
 * @returns String like "VENDOR"
 */
export function counterpartyTypeToString(value: number): string {
    return COUNTERPARTY_TYPE_LABELS[value] ?? "VENDOR";
}

/**
 * Get dropdown options for jurisdiction code select
 */
export function getJurisdictionCodeOptions(): { value: string; label: string }[] {
    return [
        { value: "none", label: "None" },
        { value: "DOMESTIC", label: "Domestic (Local)" },
        { value: "FATF_COMPLIANT", label: "FATF Compliant" },
        { value: "FATF_GREY", label: "FATF Grey-listed" },
        { value: "HIGH_RISK", label: "High-Risk Center" },
        { value: "SANCTIONED", label: "Sanctioned Territory" },
    ];
}

/**
 * Get dropdown options for purpose code select
 */
export function getPurposeCodeOptions(): { value: string; label: string }[] {
    return [
        { value: "none", label: "None" },
        { value: "GDDS", label: "Goods (GDDS)" },
        { value: "SVCS", label: "Services (SVCS)" },
        { value: "SALA", label: "Payroll (SALA)" },
        { value: "SUPP", label: "Supplier (SUPP)" },
        { value: "CONS", label: "Consulting (CONS)" },
        { value: "REBT", label: "Rebate/Refund (REBT)" },
        { value: "RENT", label: "Rent/Lease (RENT)" },
        { value: "TAXS", label: "Taxes (TAXS)" },
        { value: "INTC", label: "Intra-company (INTC)" },
        { value: "LOAN", label: "Loan (LOAN)" },
        { value: "INVS", label: "Investment (INVS)" },
        { value: "OTHR", label: "Other (OTHR)" },
    ];
}

/**
 * Get dropdown options for risk tier select
 */
export function getRiskTierOptions(minimumRiskFloor: string = "LOW"): { value: string; label: string }[] {
    const allOptions = [
        { value: "LOW", label: "LOW - Routine, verified counterparty" },
        { value: "MEDIUM", label: "MEDIUM - New vendor, elevated amount" },
        { value: "HIGH", label: "HIGH - Cross-border to non-FATF, large single tx" },
        { value: "WATCHLIST", label: "WATCHLIST - Sanctioned counterparty/territory" },
    ];
    
    // Filter options based on minimum risk floor mapping from jurisdiction
    let floorIndex = stringToRiskTier("LOW");
    if (minimumRiskFloor === "SANCTIONED") floorIndex = stringToRiskTier("WATCHLIST");
    else if (minimumRiskFloor === "HIGH_RISK") floorIndex = stringToRiskTier("HIGH");
    else if (minimumRiskFloor === "FATF_GREY") floorIndex = stringToRiskTier("MEDIUM");
    return allOptions.filter(opt => stringToRiskTier(opt.value) >= floorIndex);
}

/**
 * Get dropdown options for counterparty type select
 */
export function getCounterpartyTypeOptions(): { value: string; label: string }[] {
    return [
        { value: "VENDOR", label: "Vendor" },
        { value: "CONTRACTOR", label: "Contractor" },
        { value: "EMPLOYEE", label: "Employee" },
        { value: "INTERCOMPANY", label: "Intercompany" },
        { value: "GOVERNMENT", label: "Government" },
    ];
}
