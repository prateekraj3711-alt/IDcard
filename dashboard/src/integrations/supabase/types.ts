export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bulk_import_rows: {
        Row: {
          bulk_import_id: string
          created_at: string
          errors: Json | null
          id: string
          mapped: Json | null
          photo_storage_key: string | null
          raw: Json
          row_index: number
          school_id: string
          status: Database["public"]["Enums"]["bulk_import_row_status"]
          student_id: string | null
          updated_at: string
        }
        Insert: {
          bulk_import_id: string
          created_at?: string
          errors?: Json | null
          id?: string
          mapped?: Json | null
          photo_storage_key?: string | null
          raw: Json
          row_index: number
          school_id: string
          status?: Database["public"]["Enums"]["bulk_import_row_status"]
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          bulk_import_id?: string
          created_at?: string
          errors?: Json | null
          id?: string
          mapped?: Json | null
          photo_storage_key?: string | null
          raw?: Json
          row_index?: number
          school_id?: string
          status?: Database["public"]["Enums"]["bulk_import_row_status"]
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_import_rows_bulk_import_id_fkey"
            columns: ["bulk_import_id"]
            isOneToOne: false
            referencedRelation: "bulk_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_rows_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_rows_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_imports: {
        Row: {
          column_mapping: Json | null
          created_at: string
          error: string | null
          id: string
          original_filename: string
          school_id: string
          source_type: string
          stats: Json | null
          status: Database["public"]["Enums"]["bulk_import_status"]
          updated_at: string
          uploader_id: string
        }
        Insert: {
          column_mapping?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          original_filename: string
          school_id: string
          source_type: string
          stats?: Json | null
          status?: Database["public"]["Enums"]["bulk_import_status"]
          updated_at?: string
          uploader_id?: string
        }
        Update: {
          column_mapping?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          original_filename?: string
          school_id?: string
          source_type?: string
          stats?: Json | null
          status?: Database["public"]["Enums"]["bulk_import_status"]
          updated_at?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_imports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          id: string
          name: string
          ordering: number
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          ordering?: number
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          ordering?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      id_card_jobs: {
        Row: {
          class_id: string | null
          created_at: string
          error: string | null
          file_size: number | null
          id: string
          layout: string
          output_format: string
          output_key: string | null
          processed: number
          requested_by: string
          school_id: string
          section_id: string | null
          status: Database["public"]["Enums"]["id_card_job_status"]
          student_ids: Json | null
          template_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          error?: string | null
          file_size?: number | null
          id?: string
          layout?: string
          output_format?: string
          output_key?: string | null
          processed?: number
          requested_by?: string
          school_id: string
          section_id?: string | null
          status?: Database["public"]["Enums"]["id_card_job_status"]
          student_ids?: Json | null
          template_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          error?: string | null
          file_size?: number | null
          id?: string
          layout?: string
          output_format?: string
          output_key?: string | null
          processed?: number
          requested_by?: string
          school_id?: string
          section_id?: string | null
          status?: Database["public"]["Enums"]["id_card_job_status"]
          student_ids?: Json | null
          template_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "id_card_jobs_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "id_card_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "id_card_jobs_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "id_card_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "id_card_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      id_card_templates: {
        Row: {
          card_height_mm: number
          card_width_mm: number
          created_at: string
          created_by: string | null
          css: string
          html: string | null
          id: string
          is_active: boolean
          layout_json: Json | null
          module: Database["public"]["Enums"]["template_module"]
          name: string
          paper_size: string
          school_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          card_height_mm?: number
          card_width_mm?: number
          created_at?: string
          created_by?: string | null
          css?: string
          html?: string | null
          id?: string
          is_active?: boolean
          layout_json?: Json | null
          module?: Database["public"]["Enums"]["template_module"]
          name: string
          paper_size?: string
          school_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          card_height_mm?: number
          card_width_mm?: number
          created_at?: string
          created_by?: string | null
          css?: string
          html?: string | null
          id?: string
          is_active?: boolean
          layout_json?: Json | null
          module?: Database["public"]["Enums"]["template_module"]
          name?: string
          paper_size?: string
          school_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "id_card_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      id_cards: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          generated_by: string | null
          id: string
          mime_type: string
          qr_payload: Json | null
          school_id: string
          storage_path: string
          student_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          generated_by?: string | null
          id?: string
          mime_type?: string
          qr_payload?: Json | null
          school_id: string
          storage_path: string
          student_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          generated_by?: string | null
          id?: string
          mime_type?: string
          qr_payload?: Json | null
          school_id?: string
          storage_path?: string
          student_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "id_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "id_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "id_cards_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "id_card_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          content_type: string
          created_at: string
          height: number | null
          id: string
          is_primary: boolean
          school_id: string
          sha256: string
          size_bytes: number
          storage_path: string
          student_id: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          content_type?: string
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean
          school_id: string
          sha256: string
          size_bytes: number
          storage_path: string
          student_id: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          content_type?: string
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean
          school_id?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          student_id?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          phone: string | null
          school_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          school_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          school_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          logo_path: string | null
          logo_url: string | null
          name: string
          phone: string | null
          pincode: string | null
          principal_name: string | null
          signature_path: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          pincode?: string | null
          principal_name?: string | null
          signature_path?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          pincode?: string | null
          principal_name?: string | null
          signature_path?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          class_id: string
          created_at: string
          id: string
          name: string
          ordering: number
          school_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          name: string
          ordering?: number
          school_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          ordering?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          blood_group: string | null
          class_id: string | null
          client_uuid: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dob: string | null
          enrolled_on: string | null
          enrollment_no: string
          extra: Json
          father_name: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          mobile: string | null
          mother_name: string | null
          name: string
          photo_hash: string | null
          photo_path: string | null
          roll_no: string | null
          school_id: string
          section_id: string | null
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          blood_group?: string | null
          class_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dob?: string | null
          enrolled_on?: string | null
          enrollment_no: string
          extra?: Json
          father_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          mobile?: string | null
          mother_name?: string | null
          name: string
          photo_hash?: string | null
          photo_path?: string | null
          roll_no?: string | null
          school_id: string
          section_id?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          blood_group?: string | null
          class_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dob?: string | null
          enrolled_on?: string | null
          enrollment_no?: string
          extra?: Json
          father_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          mobile?: string | null
          mother_name?: string | null
          name?: string
          photo_hash?: string | null
          photo_path?: string | null
          roll_no?: string | null
          school_id?: string
          section_id?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          client_uuid: string | null
          created_at: string
          device_id: string | null
          error: string | null
          id: string
          operation: Database["public"]["Enums"]["sync_op"]
          payload: Json | null
          retries: number
          status: Database["public"]["Enums"]["sync_status"]
          student_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          id?: string
          operation: Database["public"]["Enums"]["sync_op"]
          payload?: Json | null
          retries?: number
          status: Database["public"]["Enums"]["sync_status"]
          student_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_uuid?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          id?: string
          operation?: Database["public"]["Enums"]["sync_op"]
          payload?: Json | null
          retries?: number
          status?: Database["public"]["Enums"]["sync_status"]
          student_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_school: { Args: { _school_id: string }; Returns: boolean }
      can_access_school_path: { Args: { _segment: string }; Returns: boolean }
      current_school_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_student_photo: {
        Args: {
          _content_type?: string
          _height: number
          _sha256: string
          _size_bytes: number
          _storage_path: string
          _student_id: string
          _width: number
        }
        Returns: {
          content_type: string
          created_at: string
          height: number | null
          id: string
          is_primary: boolean
          school_id: string
          sha256: string
          size_bytes: number
          storage_path: string
          student_id: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "photos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "super_admin" | "teacher"
      bulk_import_row_status:
        | "pending"
        | "valid"
        | "invalid"
        | "imported"
        | "failed"
      bulk_import_status:
        | "uploaded"
        | "validated"
        | "importing"
        | "completed"
        | "failed"
      gender: "male" | "female" | "other"
      id_card_job_status: "queued" | "running" | "done" | "failed"
      student_status: "draft" | "submitted" | "active" | "archived"
      sync_op: "create" | "update" | "delete" | "photo_upload"
      sync_status: "pending" | "uploading" | "uploaded" | "failed"
      template_module: "student" | "employee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "teacher"],
      bulk_import_row_status: [
        "pending",
        "valid",
        "invalid",
        "imported",
        "failed",
      ],
      bulk_import_status: [
        "uploaded",
        "validated",
        "importing",
        "completed",
        "failed",
      ],
      gender: ["male", "female", "other"],
      id_card_job_status: ["queued", "running", "done", "failed"],
      student_status: ["draft", "submitted", "active", "archived"],
      sync_op: ["create", "update", "delete", "photo_upload"],
      sync_status: ["pending", "uploading", "uploaded", "failed"],
      template_module: ["student", "employee"],
    },
  },
} as const
