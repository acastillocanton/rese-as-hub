export type Role = "admin" | "sales" | "reviews_manager" | "office_director";

/** El office_director es admin scoped a una sola ficha (su `location_id`).
 *  Helpers para tener un sitio único donde mirar capacidades transversales. */
export function isAdminLike(role: Role | null | undefined): boolean {
  return role === "admin" || role === "office_director";
}
export function isOfficeDirector(role: Role | null | undefined): boolean {
  return role === "office_director";
}
export function canManageSales(role: Role | null | undefined): boolean {
  return role === "admin" || role === "reviews_manager" || role === "office_director";
}

export type ProfileStatus = "invited" | "active" | "paused" | "archived";

export type MatchState = "counted" | "pending" | "unmatched";

export type OauthStatus = "disconnected" | "connected" | "error";

export type ShareSource = "whatsapp" | "email" | "sms" | "qr" | "direct";

export type SalesDepartment = "nacional" | "internacional" | "castellon" | "valencia";

export type PauseReason = "vacaciones" | "baja_medica" | "permiso_laboral";

/** Lista cerrada de idiomas para comerciales internacionales. Si en el
 *  futuro hay que añadir uno (Francés, Alemán, Italiano…), basta con
 *  ampliar este array y la migración no necesita cambios — el campo en
 *  DB es text libre, esta constante solo controla la UI. */
export const SALES_LANGUAGES = [
  "Inglés/Nórdico",
  "Rumano",
  "Polaco",
  "Ruso/Búlgaro/Húngaro",
] as const;

export type SalesLanguage = (typeof SALES_LANGUAGES)[number];

/**
 * Hand-rolled Database types. Replace with `supabase gen types typescript` output
 * once the project is linked to a Supabase project.
 */
export type Database = {
  public: {
    Tables: {
      locations: {
        Row: {
          id: string;
          name: string;
          google_place_id: string | null;
          google_account_id: string | null;
          google_location_resource: string | null;
          google_account_email: string | null;
          oauth_status: OauthStatus;
          oauth_last_sync_at: string | null;
          oauth_last_sync_error: string | null;
          total_review_count: number | null;
          average_rating: number | null;
          rating_updated_at: string | null;
          rating_source: "manual" | "google_api" | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          google_place_id?: string | null;
          google_account_id?: string | null;
          google_location_resource?: string | null;
          google_account_email?: string | null;
          oauth_status?: OauthStatus;
          oauth_last_sync_at?: string | null;
          oauth_last_sync_error?: string | null;
          total_review_count?: number | null;
          average_rating?: number | null;
          rating_updated_at?: string | null;
          rating_source?: "manual" | "google_api" | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["locations"]["Insert"]>;
        Relationships: [];
      };
      location_secrets: {
        Row: {
          location_id: string;
          oauth_refresh_token: string | null;
          oauth_access_token: string | null;
          expires_at: string | null;
          updated_at: string;
        };
        Insert: {
          location_id: string;
          oauth_refresh_token?: string | null;
          oauth_access_token?: string | null;
          expires_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["location_secrets"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: Role;
          location_id: string | null;
          slug: string;
          email: string | null;
          phone: string | null;
          monthly_goal: number;
          status: ProfileStatus;
          avatar_url: string | null;
          joined_at: string;
          department: SalesDepartment | null;
          language: string | null;
          paused_reason: PauseReason | null;
          notes: string | null;
          archived_at: string | null;
        };
        Insert: {
          id: string;
          full_name: string;
          role: Role;
          location_id?: string | null;
          slug: string;
          email?: string | null;
          phone?: string | null;
          monthly_goal?: number;
          status?: ProfileStatus;
          avatar_url?: string | null;
          joined_at?: string;
          department?: SalesDepartment | null;
          language?: string | null;
          paused_reason?: PauseReason | null;
          notes?: string | null;
          archived_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          sales_id: string;
          full_name: string;
          slug: string;
          email: string | null;
          phone: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sales_id: string;
          full_name: string;
          slug: string;
          email?: string | null;
          phone?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };
      share_links: {
        Row: {
          id: string;
          sales_id: string;
          client_id: string | null;
          location_id: string;
          link_token: string;
          opened_at: string;
          source: ShareSource;
          user_agent: string | null;
        };
        Insert: {
          id?: string;
          sales_id: string;
          client_id?: string | null;
          location_id: string;
          link_token: string;
          opened_at?: string;
          source?: ShareSource;
          user_agent?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["share_links"]["Insert"]>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          location_id: string;
          google_review_id: string;
          author_name: string;
          rating: number;
          text: string | null;
          google_created_at: string;
          fetched_at: string;
          sales_id: string | null;
          client_id: string | null;
          share_link_id: string | null;
          match_confidence: number;
          match_state: MatchState;
          match_evidence: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          location_id: string;
          google_review_id: string;
          author_name: string;
          rating: number;
          text?: string | null;
          google_created_at: string;
          fetched_at?: string;
          sales_id?: string | null;
          client_id?: string | null;
          share_link_id?: string | null;
          match_confidence?: number;
          match_state?: MatchState;
          match_evidence?: Record<string, unknown> | null;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          payload: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          action: string;
          payload?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      role_enum: Role;
      profile_status_enum: ProfileStatus;
      match_state_enum: MatchState;
      oauth_status_enum: OauthStatus;
      share_source_enum: ShareSource;
      sales_department_enum: SalesDepartment;
      pause_reason_enum: PauseReason;
    };
    CompositeTypes: Record<string, never>;
  };
};
