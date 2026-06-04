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
/** Productor = quien puede tener clientes/share_links/reviews atribuidas
 *  (sales_id en esas tablas). Hoy es `sales` y `office_director` — los
 *  directores también venden y tienen su propio enlace /c/{slug}. */
export function isProducer(role: Role | null | undefined): boolean {
  return role === "sales" || role === "office_director";
}

export type ProfileStatus = "invited" | "active" | "paused" | "archived";

export type MatchState = "counted" | "pending" | "unmatched";

export type OauthStatus = "disconnected" | "connected" | "error";

export type ShareSource = "whatsapp" | "email" | "sms" | "qr" | "direct";

export type SalesDepartment = "nacional" | "internacional" | "castellon" | "valencia";

/** Marca operativa de la `location`. El grupo Marina d'Or opera con dos:
 *  - `inseryal` → "Inseryal by Marina d'Or" (Oropesa, Pardiñas, Vergara,
 *    Leganés, Chamberí).
 *  - `marina_dor_construcciones` → "Marina d'Or Construcciones"
 *    (Castellón, Valencia).
 *  Las etiquetas humanas y el logo del email viven en `lib/branding.ts`. */
export type Brand = "inseryal" | "marina_dor_construcciones";

export type PauseReason = "vacaciones" | "baja_medica" | "permiso_laboral";

export type SupportCategory = "general" | "review_question" | "technical" | "billing";
export type SupportStatus = "open" | "closed";

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
          brand: Brand;
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
          brand?: Brand;
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
          /** Para `role='sales'`: id del office_director responsable (nullable —
           *  un sales sin director asignado vive en el pool del admin/reviews_manager).
           *  Para el resto de roles: NULL. */
          director_id: string | null;
          slug: string;
          email: string | null;
          phone: string | null;
          monthly_goal: number;
          /** Comisión por reseña en € (numeric). NULL = tarifa no configurada.
           *  Migración 020. Aplica a productores (sales + office_director). */
          commission_rate: number | null;
          status: ProfileStatus;
          avatar_url: string | null;
          joined_at: string;
          department: SalesDepartment | null;
          language: string | null;
          paused_reason: PauseReason | null;
          notes: string | null;
          archived_at: string | null;
          /** Plantillas de mensaje personalizadas por el comercial, keyed por
           *  MessageTemplateId (ver lib/messaging.ts). NULL = usa las de código.
           *  Migración 019. */
          message_templates: Record<string, { label?: string; body?: string }> | null;
        };
        Insert: {
          id: string;
          full_name: string;
          role: Role;
          location_id?: string | null;
          director_id?: string | null;
          slug: string;
          email?: string | null;
          phone?: string | null;
          monthly_goal?: number;
          commission_rate?: number | null;
          status?: ProfileStatus;
          avatar_url?: string | null;
          joined_at?: string;
          department?: SalesDepartment | null;
          language?: string | null;
          paused_reason?: PauseReason | null;
          notes?: string | null;
          archived_at?: string | null;
          message_templates?: Record<string, { label?: string; body?: string }> | null;
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
          /** Migración 015. Marca anti-fraude: cuando varias reseñas llegan al
           *  mismo client_id (cliente reenvía el enlace a otros), la primera
           *  por google_created_at queda principal (is_duplicate=false) y el
           *  resto se marca true para no contar en KPIs/Excel/ranking. */
          is_duplicate: boolean;
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
          is_duplicate?: boolean;
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
      support_conversations: {
        Row: {
          id: string;
          subject: string;
          category: SupportCategory;
          status: SupportStatus;
          opener_id: string;
          linked_review_id: string | null;
          linked_client_id: string | null;
          created_at: string;
          closed_at: string | null;
          last_message_at: string;
        };
        Insert: {
          id?: string;
          subject: string;
          category?: SupportCategory;
          status?: SupportStatus;
          opener_id: string;
          linked_review_id?: string | null;
          linked_client_id?: string | null;
          created_at?: string;
          closed_at?: string | null;
          last_message_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["support_conversations"]["Insert"]>;
        Relationships: [];
      };
      support_messages: {
        Row: {
          id: string;
          conversation_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          author_id: string;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["support_messages"]["Insert"]>;
        Relationships: [];
      };
      support_read_receipts: {
        Row: {
          user_id: string;
          conversation_id: string;
          last_read_at: string;
        };
        Insert: {
          user_id: string;
          conversation_id: string;
          last_read_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["support_read_receipts"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      support_unread_count: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      role_enum: Role;
      profile_status_enum: ProfileStatus;
      match_state_enum: MatchState;
      oauth_status_enum: OauthStatus;
      share_source_enum: ShareSource;
      sales_department_enum: SalesDepartment;
      pause_reason_enum: PauseReason;
      brand_enum: Brand;
    };
    CompositeTypes: Record<string, never>;
  };
};
