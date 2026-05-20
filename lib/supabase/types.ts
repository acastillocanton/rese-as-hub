export type Role = "admin" | "sales" | "reviews_manager";

export type ProfileStatus = "invited" | "active" | "paused";

export type MatchState = "counted" | "pending" | "unmatched";

export type OauthStatus = "disconnected" | "connected" | "error";

export type ShareSource = "whatsapp" | "email" | "sms" | "qr" | "direct";

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
          oauth_status: OauthStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          google_place_id?: string | null;
          google_account_id?: string | null;
          oauth_status?: OauthStatus;
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
    };
    CompositeTypes: Record<string, never>;
  };
};
