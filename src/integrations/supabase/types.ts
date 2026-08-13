export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      attendance_records: {
        Row: {
          created_at: string;
          id: string;
          marked_at: string;
          session_id: string;
          status: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          marked_at?: string;
          session_id: string;
          status?: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          marked_at?: string;
          session_id?: string;
          status?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "attendance_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_sessions: {
        Row: {
          class_section_id: string;
          created_at: string;
          ended_at: string | null;
          id: string;
          is_active: boolean;
          secret: string;
          started_at: string;
          subject_id: string | null;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          class_section_id: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          is_active?: boolean;
          secret?: string;
          started_at?: string;
          subject_id?: string | null;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          class_section_id?: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          is_active?: boolean;
          secret?: string;
          started_at?: string;
          subject_id?: string | null;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_class_section_id_fkey";
            columns: ["class_section_id"];
            isOneToOne: false;
            referencedRelation: "class_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      class_sections: {
        Row: {
          batch: string | null;
          created_at: string;
          department_id: string | null;
          id: string;
          name: string;
          section: string;
          semester: number;
        };
        Insert: {
          batch?: string | null;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          name: string;
          section: string;
          semester: number;
        };
        Update: {
          batch?: string | null;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          name?: string;
          section?: string;
          semester?: number;
        };
        Relationships: [
          {
            foreignKeyName: "class_sections_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          code: string;
          created_at: string;
          hod_id: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          hod_id?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          hod_id?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          department_id: string | null;
          email: string;
          first_name: string;
          id: string;
          last_name: string;
          middle_name: string | null;
          phone: string | null;
          photo_url: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id?: string | null;
          email?: string;
          first_name?: string;
          id: string;
          last_name?: string;
          middle_name?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string | null;
          email?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          middle_name?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      student_details: {
        Row: {
          address: string | null;
          admission_date: string | null;
          batch: string | null;
          blood_group: string | null;
          branch: string | null;
          created_at: string;
          date_of_birth: string | null;
          emergency_contact: string | null;
          gender: string | null;
          id_proof_url: string | null;
          parent_mobile: string | null;
          parent_name: string | null;
          prn: string | null;
          registration_number: string | null;
          roll_number: string | null;
          section: string | null;
          semester: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          admission_date?: string | null;
          batch?: string | null;
          blood_group?: string | null;
          branch?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          emergency_contact?: string | null;
          gender?: string | null;
          id_proof_url?: string | null;
          parent_mobile?: string | null;
          parent_name?: string | null;
          prn?: string | null;
          registration_number?: string | null;
          roll_number?: string | null;
          section?: string | null;
          semester?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          admission_date?: string | null;
          batch?: string | null;
          blood_group?: string | null;
          branch?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          emergency_contact?: string | null;
          gender?: string | null;
          id_proof_url?: string | null;
          parent_mobile?: string | null;
          parent_name?: string | null;
          prn?: string | null;
          registration_number?: string | null;
          roll_number?: string | null;
          section?: string | null;
          semester?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      subjects: {
        Row: {
          code: string;
          created_at: string;
          credits: number | null;
          department_id: string | null;
          id: string;
          name: string;
          semester: number | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          credits?: number | null;
          department_id?: string | null;
          id?: string;
          name: string;
          semester?: number | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          credits?: number | null;
          department_id?: string | null;
          id?: string;
          name?: string;
          semester?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "subjects_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_details: {
        Row: {
          created_at: string;
          employee_id: string | null;
          joining_date: string | null;
          qualification: string | null;
          signature_url: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          employee_id?: string | null;
          joining_date?: string | null;
          qualification?: string | null;
          signature_url?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          employee_id?: string | null;
          joining_date?: string | null;
          qualification?: string | null;
          signature_url?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      timetable_slots: {
        Row: {
          class_section_id: string;
          created_at: string;
          day_of_week: number;
          end_time: string;
          id: string;
          room: string | null;
          start_time: string;
          subject_id: string | null;
          teacher_id: string | null;
          updated_at: string;
        };
        Insert: {
          class_section_id: string;
          created_at?: string;
          day_of_week: number;
          end_time: string;
          id?: string;
          room?: string | null;
          start_time: string;
          subject_id?: string | null;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Update: {
          class_section_id?: string;
          created_at?: string;
          day_of_week?: number;
          end_time?: string;
          id?: string;
          room?: string | null;
          start_time?: string;
          subject_id?: string | null;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "timetable_slots_class_section_id_fkey";
            columns: ["class_section_id"];
            isOneToOne: false;
            referencedRelation: "class_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_slots_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_staff: { Args: { _user_id: string }; Returns: boolean };
    };
    Enums: {
      app_role: "super_admin" | "principal" | "hod" | "teacher" | "cr" | "student";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "principal", "hod", "teacher", "cr", "student"],
    },
  },
} as const;
