
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "bank_accounts": {
                  Row: {
                    "account_name": string,"account_no": string,"bank_name": string,"created_at": string,"created_by": string | null,"firm_id": string,"id": string,"is_active": boolean,"is_default": boolean,"is_sample": boolean,"name": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "account_name"?: string,"account_no"?: string,"bank_name"?: string,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"is_active"?: boolean,"is_default"?: boolean,"is_sample"?: boolean,"name": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "account_name"?: string,"account_no"?: string,"bank_name"?: string,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"is_active"?: boolean,"is_default"?: boolean,"is_sample"?: boolean,"name"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bank_accounts_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"change_log": {
                  Row: {
                    "action": Database["public"]['Enums']["change_action"],"actor": string | null,"after": Json | null,"at": string,"before": Json | null,"firm_id": string | null,"id": number,"row_id": string | null,"table_name": string
                  }
                  Insert: {
                    "action": Database["public"]['Enums']["change_action"],"actor"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"firm_id"?: string | null,"id"?: never,"row_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["change_action"],"actor"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"firm_id"?: string | null,"id"?: never,"row_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "change_log_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "address1": string,"address2": string,"assigned_to": string | null,"city": string,"client_code": string,"contact": string,"country": string,"created_at": string,"created_by": string | null,"email": string,"firm_id": string,"id": string,"industry": string,"is_sample": boolean,"name": string,"notes": string,"phone": string,"postcode": string,"registration_no": string,"state": string,"status": Database["public"]['Enums']["client_status"],"tags": (string)[],"type": Database["public"]['Enums']["client_type"],"updated_at": string,"updated_by": string | null,"website": string
                  }
                  Insert: {
                    "address1"?: string,"address2"?: string,"assigned_to"?: string | null,"city"?: string,"client_code"?: string,"contact"?: string,"country"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string,"firm_id"?: string,"id"?: string,"industry"?: string,"is_sample"?: boolean,"name": string,"notes"?: string,"phone"?: string,"postcode"?: string,"registration_no"?: string,"state"?: string,"status"?: Database["public"]['Enums']["client_status"],"tags"?: (string)[],"type"?: Database["public"]['Enums']["client_type"],"updated_at"?: string,"updated_by"?: string | null,"website"?: string
                  }
                  Update: {
                    "address1"?: string,"address2"?: string,"assigned_to"?: string | null,"city"?: string,"client_code"?: string,"contact"?: string,"country"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string,"firm_id"?: string,"id"?: string,"industry"?: string,"is_sample"?: boolean,"name"?: string,"notes"?: string,"phone"?: string,"postcode"?: string,"registration_no"?: string,"state"?: string,"status"?: Database["public"]['Enums']["client_status"],"tags"?: (string)[],"type"?: Database["public"]['Enums']["client_type"],"updated_at"?: string,"updated_by"?: string | null,"website"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"firms": {
                  Row: {
                    "address1": string,"address2": string,"billing_status": Database["public"]['Enums']["billing_status"],"city": string,"country": string,"created_at": string,"created_by": string | null,"currency": string,"date_format": string,"discrepancy_days": number,"email": string,"fy_start_month": number,"id": string,"logo_path": string | null,"name": string,"paid_at": string | null,"phone": string,"postcode": string,"registration_no": string,"show_registration_on_statement": boolean,"source": Database["public"]['Enums']["firm_source"],"sst_no": string,"state": string,"statement_note": string,"status": Database["public"]['Enums']["firm_status"],"stripe_checkout_session_id": string | null,"stripe_customer_id": string | null,"stripe_payment_intent_id": string | null,"trading_name": string,"trial_ends_at": string | null,"updated_at": string,"updated_by": string | null,"website": string
                  }
                  Insert: {
                    "address1"?: string,"address2"?: string,"billing_status"?: Database["public"]['Enums']["billing_status"],"city"?: string,"country"?: string,"created_at"?: string,"created_by"?: string | null,"currency": string,"date_format"?: string,"discrepancy_days"?: number,"email"?: string,"fy_start_month"?: number,"id"?: string,"logo_path"?: string | null,"name": string,"paid_at"?: string | null,"phone"?: string,"postcode"?: string,"registration_no"?: string,"show_registration_on_statement"?: boolean,"source"?: Database["public"]['Enums']["firm_source"],"sst_no"?: string,"state"?: string,"statement_note"?: string,"status"?: Database["public"]['Enums']["firm_status"],"stripe_checkout_session_id"?: string | null,"stripe_customer_id"?: string | null,"stripe_payment_intent_id"?: string | null,"trading_name"?: string,"trial_ends_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"website"?: string
                  }
                  Update: {
                    "address1"?: string,"address2"?: string,"billing_status"?: Database["public"]['Enums']["billing_status"],"city"?: string,"country"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"date_format"?: string,"discrepancy_days"?: number,"email"?: string,"fy_start_month"?: number,"id"?: string,"logo_path"?: string | null,"name"?: string,"paid_at"?: string | null,"phone"?: string,"postcode"?: string,"registration_no"?: string,"show_registration_on_statement"?: boolean,"source"?: Database["public"]['Enums']["firm_source"],"sst_no"?: string,"state"?: string,"statement_note"?: string,"status"?: Database["public"]['Enums']["firm_status"],"stripe_checkout_session_id"?: string | null,"stripe_customer_id"?: string | null,"stripe_payment_intent_id"?: string | null,"trading_name"?: string,"trial_ends_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"website"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "firm_cap": number,"id": boolean,"trial_days": number
                  }
                  Insert: {
                    "firm_cap"?: number,"id"?: boolean,"trial_days"?: number
                  }
                  Update: {
                    "firm_cap"?: number,"id"?: boolean,"trial_days"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"created_by": string | null,"email": string,"firm_id": string | null,"id": string,"is_super_admin": boolean,"last_active_at": string | null,"name": string,"role": Database["public"]['Enums']["member_role"],"status": Database["public"]['Enums']["member_status"],"updated_at": string,"updated_by": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"email": string,"firm_id"?: string | null,"id"?: string,"is_super_admin"?: boolean,"last_active_at"?: string | null,"name": string,"role"?: Database["public"]['Enums']["member_role"],"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"updated_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"email"?: string,"firm_id"?: string | null,"id"?: string,"is_super_admin"?: boolean,"last_active_at"?: string | null,"name"?: string,"role"?: Database["public"]['Enums']["member_role"],"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"stripe_events": {
                  Row: {
                    "event_id": string,"received_at": string,"type": string
                  }
                  Insert: {
                    "event_id": string,"received_at"?: string,"type": string
                  }
                  Update: {
                    "event_id"?: string,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"transactions": {
                  Row: {
                    "amount_minor": number,"bank_account_id": string,"client_id": string,"created_at": string,"created_by": string | null,"date": string,"description": string,"firm_id": string,"id": string,"is_sample": boolean,"kind": Database["public"]['Enums']["txn_kind"],"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "amount_minor": number,"bank_account_id": string,"client_id": string,"created_at"?: string,"created_by"?: string | null,"date": string,"description"?: string,"firm_id"?: string,"id"?: string,"is_sample"?: boolean,"kind": Database["public"]['Enums']["txn_kind"],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"bank_account_id"?: string,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"description"?: string,"firm_id"?: string,"id"?: string,"is_sample"?: boolean,"kind"?: Database["public"]['Enums']["txn_kind"],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_bank_account_id_fkey"
      columns: ["bank_account_id"]
isOneToOne: false
      referencedRelation: "bank_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "key": string,"profile_id": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  Insert: {
                    "key": string,"profile_id": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"profile_id"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_preferences_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist": {
                  Row: {
                    "created_at": string,"email": string,"firm_name": string,"id": string
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"firm_name"?: string,"id"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"firm_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"assert_manager":
{ Args: { "p_target": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"email": string,
"firm_id": string | null,
"id": string,
"is_super_admin": boolean,
"last_active_at": string | null,
"name": string,
"role": Database["public"]['Enums']["member_role"],
"status": Database["public"]['Enums']["member_status"],
"updated_at": string,
"updated_by": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"auth_can":
{ Args: { "action": string }; Returns: boolean
                           },
"auth_firm_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"auth_profile_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"auth_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["member_role"]
                           },
"change_member_role":
{ Args: { "p_profile": string,"p_role": Database["public"]['Enums']["member_role"] }; Returns: undefined
                           },
"client_balances":
{ Args: { "p_bank_account"?: string,"p_client"?: string,"p_from": string,"p_to": string }; Returns: {
              "client_id": string,"closing": number,"last_txn_date": string,"opening": number,"payments": number,"receipts": number,"txn_count": number
            }[]
                           },
"create_firm_for_current_user":
{ Args: { "p_currency": string,"p_firm_name": string,"p_person_name": string }; Returns: string
                           },
"firm_can_write":
{ Args: { "firm": string }; Returns: boolean
                           },
"firm_write_block_reason":
{ Args: { "firm": string }; Returns: string
                           },
"import_transactions":
{ Args: { "p_dry_run"?: boolean,"p_rows": Json }; Returns: Json
                           },
"join_waitlist":
{ Args: { "p_email": string,"p_firm_name": string }; Returns: undefined
                           },
"ledger_lines":
{ Args: { "p_bank_account"?: string,"p_client"?: string,"p_from": string,"p_per_client"?: boolean,"p_to": string }; Returns: {
              "amount_minor": number,"balance": number,"bank_account_id": string,"client_id": string,"created_at": string,"date": string,"description": string,"id": string,"kind": Database["public"]['Enums']["txn_kind"],"updated_at": string
            }[]
                           },
"load_sample_data":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"platform_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"reactivate_member":
{ Args: { "p_profile": string }; Returns: undefined
                           },
"record_payment":
{ Args: { "p_firm_id": string,"p_payment_intent_id": string }; Returns: undefined
                           },
"record_refund":
{ Args: { "p_firm_id": string }; Returns: undefined
                           },
"remove_sample_data":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"support_client_balances":
{ Args: { "p_firm": string,"p_from": string,"p_to": string }; Returns: {
              "client_id": string,"closing": number,"last_txn_date": string,"opening": number,"payments": number,"receipts": number,"txn_count": number
            }[]
                           },
"suspend_member":
{ Args: { "p_profile": string }; Returns: undefined
                           },
"touch_last_active":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"transfer_ownership":
{ Args: { "p_profile": string }; Returns: undefined
                           }
          }
          Enums: {
            "billing_status": "trial"|"paid"|"complimentary"|"read_only","change_action": "insert"|"update"|"delete"|"support_access"|"billing","client_status": "active"|"inactive"|"archived","client_type": "company"|"individual","firm_source": "self_serve"|"admin","firm_status": "active"|"suspended","member_role": "owner"|"admin"|"accountant"|"viewer","member_status": "active"|"invited"|"suspended","txn_kind": "receipt"|"payment"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "billing_status": ["trial", "paid", "complimentary", "read_only"],"change_action": ["insert", "update", "delete", "support_access", "billing"],"client_status": ["active", "inactive", "archived"],"client_type": ["company", "individual"],"firm_source": ["self_serve", "admin"],"firm_status": ["active", "suspended"],"member_role": ["owner", "admin", "accountant", "viewer"],"member_status": ["active", "invited", "suspended"],"txn_kind": ["receipt", "payment"]
          }
        }
} as const
