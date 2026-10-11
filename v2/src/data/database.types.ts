
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
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"before": Json | null,"created_at": string,"id": number,"org_id": string,"target": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: never,"org_id": string,"target": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: never,"org_id"?: string,"target"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"form_submissions": {
                  Row: {
                    "answers": NonNullable<Json>,"created_at": string,"form_id": string,"id": string,"node_id": string | null,"org_id": string,"outcome": string,"record_id": string | null,"submitted_by": string,"task_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "answers": NonNullable<Json>,"created_at"?: string,"form_id": string,"id"?: string,"node_id"?: string | null,"org_id": string,"outcome"?: string,"record_id"?: string | null,"submitted_by": string,"task_id"?: string | null
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"created_at"?: string,"form_id"?: string,"id"?: string,"node_id"?: string | null,"org_id"?: string,"outcome"?: string,"record_id"?: string | null,"submitted_by"?: string,"task_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "form_submissions_form_id_org_id_fkey"
      columns: ["form_id","org_id"]
isOneToOne: false
      referencedRelation: "forms"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "form_submissions_record_fkey"
      columns: ["record_id","org_id"]
isOneToOne: false
      referencedRelation: "records"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "form_submissions_task_id_fkey"
      columns: ["task_id"]
isOneToOne: true
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"forms": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"org_id": string,"schema": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"org_id": string,"schema"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"org_id"?: string,"schema"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "forms_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"member_roles": {
                  Row: {
                    "member_id": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "member_id": string,"role_id": string
                  }
                  Update: {
                    "member_id"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_roles_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_roles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string,"invited_by": string | null,"org_id": string,"status": Database["public"]['Enums']["member_status"],"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id"?: string,"invited_by"?: string | null,"org_id": string,"status"?: Database["public"]['Enums']["member_status"],"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"invited_by"?: string | null,"org_id"?: string,"status"?: Database["public"]['Enums']["member_status"],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"orgs": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"permissions": {
                  Row: {
                    "grp": string,"key": string,"label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "grp": string,"key": string,"label": string
                  }
                  Update: {
                    "grp"?: string,"key"?: string,"label"?: string
                  }
                  Relationships: [
                    
                  ]
                },"record_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"detail": NonNullable<Json>,"id": number,"kind": string,"node_id": string | null,"org_id": string,"record_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind": string,"node_id"?: string | null,"org_id": string,"record_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind"?: string,"node_id"?: string | null,"org_id"?: string,"record_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "record_events_record_id_org_id_fkey"
      columns: ["record_id","org_id"]
isOneToOne: false
      referencedRelation: "records"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"records": {
                  Row: {
                    "created_at": string,"current_node_id": string | null,"data": NonNullable<Json>,"error": string | null,"id": string,"label": string | null,"org_id": string,"started_by": string,"status": string,"step": number,"title": string,"updated_at": string,"workflow_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_node_id"?: string | null,"data"?: NonNullable<Json>,"error"?: string | null,"id"?: string,"label"?: string | null,"org_id": string,"started_by": string,"status"?: string,"step"?: number,"title": string,"updated_at"?: string,"workflow_id": string
                  }
                  Update: {
                    "created_at"?: string,"current_node_id"?: string | null,"data"?: NonNullable<Json>,"error"?: string | null,"id"?: string,"label"?: string | null,"org_id"?: string,"started_by"?: string,"status"?: string,"step"?: number,"title"?: string,"updated_at"?: string,"workflow_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "records_workflow_id_org_id_fkey"
      columns: ["workflow_id","org_id"]
isOneToOne: false
      referencedRelation: "workflows"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission": string,"role_id": string
                  }
                  Update: {
                    "permission"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_fkey"
      columns: ["permission"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"id": string,"is_owner": boolean,"is_system": boolean,"name": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_owner"?: boolean,"is_system"?: boolean,"name": string,"org_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_owner"?: boolean,"is_system"?: boolean,"name"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"scheduled_actions": {
                  Row: {
                    "created_at": string,"error": string | null,"finished_at": string | null,"id": string,"org_id": string,"record_id": string,"resume_node_id": string,"run_at": string,"state_at_schedule": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"org_id": string,"record_id": string,"resume_node_id": string,"run_at": string,"state_at_schedule": number,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"org_id"?: string,"record_id"?: string,"resume_node_id"?: string,"run_at"?: string,"state_at_schedule"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "scheduled_actions_record_id_org_id_fkey"
      columns: ["record_id","org_id"]
isOneToOne: false
      referencedRelation: "records"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "assignee_role_id": string | null,"assignee_user_id": string | null,"claimed_by": string | null,"created_at": string,"done_at": string | null,"due_at": string | null,"id": string,"node_id": string,"org_id": string,"overdue_notified_at": string | null,"record_id": string,"status": string,"is_mine": boolean | null
                  }
                  ComputedFields: "is_mine"
                  Insert: {
                    "assignee_role_id"?: string | null,"assignee_user_id"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"done_at"?: string | null,"due_at"?: string | null,"id"?: string,"node_id": string,"org_id": string,"overdue_notified_at"?: string | null,"record_id": string,"status"?: string
                  }
                  Update: {
                    "assignee_role_id"?: string | null,"assignee_user_id"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"done_at"?: string | null,"due_at"?: string | null,"id"?: string,"node_id"?: string,"org_id"?: string,"overdue_notified_at"?: string | null,"record_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_role_id_fkey"
      columns: ["assignee_role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_record_id_org_id_fkey"
      columns: ["record_id","org_id"]
isOneToOne: false
      referencedRelation: "records"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"workflow_access": {
                  Row: {
                    "can_start": boolean,"can_view_all": boolean,"org_id": string,"role_id": string,"workflow_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_start"?: boolean,"can_view_all"?: boolean,"org_id": string,"role_id": string,"workflow_id": string
                  }
                  Update: {
                    "can_start"?: boolean,"can_view_all"?: boolean,"org_id"?: string,"role_id"?: string,"workflow_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workflow_access_role_id_org_id_fkey"
      columns: ["role_id","org_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "workflow_access_workflow_id_org_id_fkey"
      columns: ["workflow_id","org_id"]
isOneToOne: false
      referencedRelation: "workflows"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"workflows": {
                  Row: {
                    "created_at": string,"created_by": string | null,"graph": NonNullable<Json>,"id": string,"name": string,"org_id": string,"published_at": string | null,"published_by": string | null,"status": string,"updated_at": string,"updated_by": string | null,"can_start": boolean | null
                  }
                  ComputedFields: "can_start"
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"graph"?: NonNullable<Json>,"id"?: string,"name": string,"org_id": string,"published_at"?: string | null,"published_by"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"graph"?: NonNullable<Json>,"id"?: string,"name"?: string,"org_id"?: string,"published_at"?: string | null,"published_by"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "workflows_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invites":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"audit":
{ Args: { "p_action": string,"p_after": Json,"p_before": Json,"p_org": string,"p_target": string }; Returns: undefined
                           },
"can_start":
{ Args: { "w": Omit<Database["public"]['Tables']["workflows"]['Row'], Database["public"]['Tables']["workflows"]['ComputedFields']> }; Returns: boolean
                           },
"claim_task":
{ Args: { "p_task": string }; Returns: undefined
                           },
"create_org":
{ Args: { "p_id"?: string,"p_name": string }; Returns: string
                           },
"current_member_id":
{ Args: { "p_org": string }; Returns: string
                           },
"delete_role":
{ Args: { "p_role_id": string }; Returns: undefined
                           },
"has_permission":
{ Args: { "p_org": string,"p_perm": string }; Returns: boolean
                           } |
{ Args: { "p_org": string,"p_perm": string,"p_workflow": string }; Returns: boolean
                           },
"is_member":
{ Args: { "p_org": string }; Returns: boolean
                           },
"is_mine":
{ Args: { "t": Omit<Database["public"]['Tables']["tasks"]['Row'], Database["public"]['Tables']["tasks"]['ComputedFields']> }; Returns: boolean
                           },
"my_permissions":
{ Args: { "p_org": string }; Returns: string[]
                           },
"open_record_counts":
{ Args: { "p_workflow": string }; Returns: {
              "n": number,"node_id": string
            }[]
                           },
"owner_count":
{ Args: { "p_org": string }; Returns: number
                           },
"record_visible":
{ Args: { "p_record": string }; Returns: boolean
                           },
"remove_member":
{ Args: { "p_member_id": string }; Returns: undefined
                           },
"require_permission":
{ Args: { "p_org": string,"p_perm": string }; Returns: undefined
                           },
"save_role":
{ Args: { "p_name": string,"p_org": string,"p_permissions": (string)[],"p_role_id": string }; Returns: string
                           },
"set_member_roles":
{ Args: { "p_member_id": string,"p_role_ids": (string)[] }; Returns: undefined
                           },
"storage_path_org":
{ Args: { "p_name": string }; Returns: string
                           }
          }
          Enums: {
            "member_status": "invited"|"active"
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
            "member_status": ["invited", "active"]
          }
        }
} as const
