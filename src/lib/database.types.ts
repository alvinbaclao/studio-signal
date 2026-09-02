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
    PostgrestVersion: "14.5"
  }
  app: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _sync_call_time_event: {
        Args: { p_entry_id: string }
        Returns: undefined
      }
      comp_teams_i_can_see: { Args: never; Returns: string[] }
      comp_teams_i_choreograph: { Args: never; Returns: string[] }
      create_invite: {
        Args: { p_email: string; p_person_id: string; p_valid_for?: string }
        Returns: string
      }
      decline_pending_person: {
        Args: { p_person_id: string; p_reason?: string }
        Returns: undefined
      }
      find_person_by_email: {
        Args: { p_email: string; p_studio_id: string }
        Returns: {
          full_name: string
          has_login: boolean
          person_id: string
          status: Database["public"]["Enums"]["person_status"]
        }[]
      }
      generate_join_code: { Args: never; Returns: string }
      is_director: { Args: { p_studio_id: string }; Returns: boolean }
      is_instructor: { Args: { p_studio_id: string }; Returns: boolean }
      my_confirmed_person_ids: { Args: never; Returns: string[] }
      my_person_ids: { Args: never; Returns: string[] }
      my_studio_ids: { Args: never; Returns: string[] }
      publish_competition: {
        Args: { p_competition_id: string }
        Returns: undefined
      }
      redeem_invite: { Args: { p_token: string }; Returns: string }
      redeem_join_code: {
        Args: {
          p_code: string
          p_registrant: Json
          p_scope: Database["public"]["Enums"]["join_code_scope"]
          p_self_role: Database["public"]["Enums"]["person_role"]
        }
        Returns: string
      }
      register_dancer: {
        Args: { p_dancer: Json; p_parent_person_id: string }
        Returns: string
      }
      revoke_join_code: {
        Args: {
          p_scope: Database["public"]["Enums"]["join_code_scope"]
          p_studio_id: string
        }
        Returns: undefined
      }
      rotate_join_code: {
        Args: {
          p_expires_at?: string
          p_max_uses?: number
          p_scope: Database["public"]["Enums"]["join_code_scope"]
          p_studio_id: string
        }
        Returns: string
      }
      set_competition_entry_call_time: {
        Args: { p_call_time: string; p_entry_id: string }
        Returns: undefined
      }
      start_direct_thread: {
        Args: { p_other_person_id: string }
        Returns: string
      }
      teams_i_can_see: { Args: never; Returns: string[] }
      teams_i_teach: { Args: never; Returns: string[] }
      threads_i_can_see: { Args: never; Returns: string[] }
      visible_person_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      booking_request: {
        Row: {
          comp_team_id: string | null
          created_at: string
          decline_reason: string | null
          ends_at: string
          id: string
          moves_event_id: string | null
          note: string | null
          preferred_space_id: string | null
          repeats: Database["public"]["Enums"]["repeat_rule"]
          requested_by: string
          resulting_event_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          studio_id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          comp_team_id?: string | null
          created_at?: string
          decline_reason?: string | null
          ends_at: string
          id?: string
          moves_event_id?: string | null
          note?: string | null
          preferred_space_id?: string | null
          repeats?: Database["public"]["Enums"]["repeat_rule"]
          requested_by: string
          resulting_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          studio_id: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          comp_team_id?: string | null
          created_at?: string
          decline_reason?: string | null
          ends_at?: string
          id?: string
          moves_event_id?: string | null
          note?: string | null
          preferred_space_id?: string | null
          repeats?: Database["public"]["Enums"]["repeat_rule"]
          requested_by?: string
          resulting_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          studio_id?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_request_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_moves_event_id_fkey"
            columns: ["moves_event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_preferred_space_id_fkey"
            columns: ["preferred_space_id"]
            isOneToOne: false
            referencedRelation: "studio_space"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_resulting_event_id_fkey"
            columns: ["resulting_event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_team: {
        Row: {
          comp_team_type: Database["public"]["Enums"]["comp_team_type"]
          created_at: string
          dance_style_id: string | null
          id: string
          is_active: boolean
          name: string
          season_id: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          comp_team_type: Database["public"]["Enums"]["comp_team_type"]
          created_at?: string
          dance_style_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          season_id: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          comp_team_type?: Database["public"]["Enums"]["comp_team_type"]
          created_at?: string
          dance_style_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          season_id?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_team_dance_style_id_fkey"
            columns: ["dance_style_id"]
            isOneToOne: false
            referencedRelation: "dance_style"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_team_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_team_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_team_cast: {
        Row: {
          comp_team_id: string
          created_at: string
          person_id: string
          role: Database["public"]["Enums"]["comp_team_role"]
          studio_id: string
        }
        Insert: {
          comp_team_id: string
          created_at?: string
          person_id: string
          role: Database["public"]["Enums"]["comp_team_role"]
          studio_id: string
        }
        Update: {
          comp_team_id?: string
          created_at?: string
          person_id?: string
          role?: Database["public"]["Enums"]["comp_team_role"]
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_team_cast_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_team_cast_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_team_cast_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_team_cast_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_team_source_team: {
        Row: {
          comp_team_id: string
          team_id: string
        }
        Insert: {
          comp_team_id: string
          team_id: string
        }
        Update: {
          comp_team_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_team_source_team_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_team_source_team_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      competition: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          name: string
          published_at: string | null
          registration_note: string | null
          starts_on: string
          studio_id: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          name: string
          published_at?: string | null
          registration_note?: string | null
          starts_on: string
          studio_id: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          name?: string
          published_at?: string | null
          registration_note?: string | null
          starts_on?: string
          studio_id?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_entry: {
        Row: {
          accepted_at: string | null
          call_time: string | null
          comp_team_id: string
          competition_id: string
          created_at: string
          id: string
          proposed_by: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          call_time?: string | null
          comp_team_id: string
          competition_id: string
          created_at?: string
          id?: string
          proposed_by?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          call_time?: string | null
          comp_team_id?: string
          competition_id?: string
          created_at?: string
          id?: string
          proposed_by?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_entry_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_entry_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_entry_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_entry_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_entry_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      dance_style: {
        Row: {
          id: string
          name: string
          studio_id: string
        }
        Insert: {
          id?: string
          name: string
          studio_id: string
        }
        Update: {
          id?: string
          name?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dance_style_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      essentials_item: {
        Row: {
          archived_at: string | null
          comp_team_id: string | null
          created_at: string
          created_by: string
          details: string | null
          file_media_id: string | null
          id: string
          item_type: Database["public"]["Enums"]["essentials_item_type"]
          link_url: string | null
          scope: Database["public"]["Enums"]["content_scope"]
          season_id: string
          sort_order: number
          studio_id: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          comp_team_id?: string | null
          created_at?: string
          created_by: string
          details?: string | null
          file_media_id?: string | null
          id?: string
          item_type: Database["public"]["Enums"]["essentials_item_type"]
          link_url?: string | null
          scope: Database["public"]["Enums"]["content_scope"]
          season_id: string
          sort_order?: number
          studio_id: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          comp_team_id?: string | null
          created_at?: string
          created_by?: string
          details?: string | null
          file_media_id?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["essentials_item_type"]
          link_url?: string | null
          scope?: Database["public"]["Enums"]["content_scope"]
          season_id?: string
          sort_order?: number
          studio_id?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "essentials_item_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "essentials_item_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "essentials_item_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "essentials_item_file_media_id_fkey"
            columns: ["file_media_id"]
            isOneToOne: false
            referencedRelation: "media_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "essentials_item_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "essentials_item_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "essentials_item_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      event: {
        Row: {
          cancelled_at: string | null
          comp_team_id: string | null
          competition_entry_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          location_note: string | null
          notes: string | null
          starts_at: string
          studio_id: string
          studio_space_id: string | null
          studio_wide: boolean
          team_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          comp_team_id?: string | null
          competition_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          location_note?: string | null
          notes?: string | null
          starts_at: string
          studio_id: string
          studio_space_id?: string | null
          studio_wide?: boolean
          team_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          comp_team_id?: string | null
          competition_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          location_note?: string | null
          notes?: string | null
          starts_at?: string
          studio_id?: string
          studio_space_id?: string | null
          studio_wide?: boolean
          team_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_competition_entry_id_fkey"
            columns: ["competition_entry_id"]
            isOneToOne: false
            referencedRelation: "competition_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_studio_space_id_fkey"
            columns: ["studio_space_id"]
            isOneToOne: false
            referencedRelation: "studio_space"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_link: {
        Row: {
          can_edit: boolean
          created_at: string
          dancer_id: string
          guardian_id: string
          id: string
          studio_id: string
        }
        Insert: {
          can_edit?: boolean
          created_at?: string
          dancer_id: string
          guardian_id: string
          id?: string
          studio_id: string
        }
        Update: {
          can_edit?: boolean
          created_at?: string
          dancer_id?: string
          guardian_id?: string
          id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_link_dancer_id_fkey"
            columns: ["dancer_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_link_dancer_id_fkey"
            columns: ["dancer_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_link_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_link_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_link_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      media_item: {
        Row: {
          byte_size: number | null
          caption: string | null
          comp_team_id: string | null
          created_at: string
          file_name: string | null
          id: string
          kind: Database["public"]["Enums"]["media_kind"]
          processing_status: Database["public"]["Enums"]["media_processing_status"]
          storage_path: string
          studio_id: string
          team_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          byte_size?: number | null
          caption?: string | null
          comp_team_id?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          kind: Database["public"]["Enums"]["media_kind"]
          processing_status?: Database["public"]["Enums"]["media_processing_status"]
          storage_path: string
          studio_id: string
          team_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          byte_size?: number | null
          caption?: string | null
          comp_team_id?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          processing_status?: Database["public"]["Enums"]["media_processing_status"]
          storage_path?: string
          studio_id?: string
          team_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_item_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_item_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_item_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_item_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_item_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
        ]
      }
      message: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_pinned: boolean
          is_urgent: boolean
          media_id: string | null
          studio_id: string
          thread_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          is_urgent?: boolean
          media_id?: string | null
          studio_id: string
          thread_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          is_urgent?: boolean
          media_id?: string | null
          studio_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_thread"
            referencedColumns: ["id"]
          },
        ]
      }
      message_thread: {
        Row: {
          comp_team_id: string | null
          created_at: string
          id: string
          scope: Database["public"]["Enums"]["thread_scope"]
          studio_id: string
          subject: string | null
          team_id: string | null
        }
        Insert: {
          comp_team_id?: string | null
          created_at?: string
          id?: string
          scope: Database["public"]["Enums"]["thread_scope"]
          studio_id: string
          subject?: string | null
          team_id?: string | null
        }
        Update: {
          comp_team_id?: string | null
          created_at?: string
          id?: string
          scope?: Database["public"]["Enums"]["thread_scope"]
          studio_id?: string
          subject?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_thread_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_thread_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_thread_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      person: {
        Row: {
          auth_user_id: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          declined_at: string | null
          declined_reason: string | null
          email: string | null
          full_name: string
          height_cm: number | null
          id: string
          is_active: boolean
          media_consent: boolean
          phone: string | null
          photo_path: string | null
          status: Database["public"]["Enums"]["person_status"]
          studio_id: string
          title: Database["public"]["Enums"]["instructor_title"] | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          email?: string | null
          full_name: string
          height_cm?: number | null
          id?: string
          is_active?: boolean
          media_consent?: boolean
          phone?: string | null
          photo_path?: string | null
          status?: Database["public"]["Enums"]["person_status"]
          studio_id: string
          title?: Database["public"]["Enums"]["instructor_title"] | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          email?: string | null
          full_name?: string
          height_cm?: number | null
          id?: string
          is_active?: boolean
          media_consent?: boolean
          phone?: string | null
          photo_path?: string | null
          status?: Database["public"]["Enums"]["person_status"]
          studio_id?: string
          title?: Database["public"]["Enums"]["instructor_title"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      person_dance_style: {
        Row: {
          dance_style_id: string
          person_id: string
        }
        Insert: {
          dance_style_id: string
          person_id: string
        }
        Update: {
          dance_style_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_dance_style_dance_style_id_fkey"
            columns: ["dance_style_id"]
            isOneToOne: false
            referencedRelation: "dance_style"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_dance_style_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_dance_style_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
        ]
      }
      person_invite: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          person_id: string
          revoked_at: string | null
          studio_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          person_id: string
          revoked_at?: string | null
          studio_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          person_id?: string
          revoked_at?: string | null
          studio_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_invite_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_invite_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_invite_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_invite_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_invite_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      person_role_assignment: {
        Row: {
          person_id: string
          role: Database["public"]["Enums"]["person_role"]
          studio_id: string
        }
        Insert: {
          person_id: string
          role: Database["public"]["Enums"]["person_role"]
          studio_id: string
        }
        Update: {
          person_id?: string
          role?: Database["public"]["Enums"]["person_role"]
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_role_assignment_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_role_assignment_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_role_assignment_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      post: {
        Row: {
          author_id: string
          body: string
          comp_team_id: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          important: boolean
          scope: Database["public"]["Enums"]["content_scope"]
          season_id: string
          studio_id: string
          team_id: string | null
        }
        Insert: {
          author_id: string
          body: string
          comp_team_id?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          important?: boolean
          scope: Database["public"]["Enums"]["content_scope"]
          season_id: string
          studio_id: string
          team_id?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          comp_team_id?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          important?: boolean
          scope?: Database["public"]["Enums"]["content_scope"]
          season_id?: string
          studio_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          media_item_id: string
          post_id: string
          sort_order: number
        }
        Insert: {
          media_item_id: string
          post_id: string
          sort_order?: number
        }
        Update: {
          media_item_id?: string
          post_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_media_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post"
            referencedColumns: ["id"]
          },
        ]
      }
      reaction: {
        Row: {
          created_at: string
          kind: string
          person_id: string
          post_id: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          kind?: string
          person_id: string
          post_id: string
          studio_id: string
        }
        Update: {
          created_at?: string
          kind?: string
          person_id?: string
          post_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reaction_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      season: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          starts_on: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          starts_on: string
          studio_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          starts_on?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      studio: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          logo_path: string | null
          name: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_path?: string | null
          name: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      studio_join_code: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          revoked_at: string | null
          scope: Database["public"]["Enums"]["join_code_scope"]
          studio_id: string
          use_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          scope: Database["public"]["Enums"]["join_code_scope"]
          studio_id: string
          use_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          scope?: Database["public"]["Enums"]["join_code_scope"]
          studio_id?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_join_code_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_join_code_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_join_code_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_space: {
        Row: {
          capacity: number | null
          created_at: string
          floor_type: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          studio_id: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          floor_type?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          studio_id: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          floor_type?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_space_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      team: {
        Row: {
          created_at: string
          dance_style_id: string | null
          id: string
          is_active: boolean
          level: string | null
          name: string
          season_id: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dance_style_id?: string | null
          id?: string
          is_active?: boolean
          level?: string | null
          name: string
          season_id: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dance_style_id?: string | null
          id?: string
          is_active?: boolean
          level?: string | null
          name?: string
          season_id?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_dance_style_id_fkey"
            columns: ["dance_style_id"]
            isOneToOne: false
            referencedRelation: "dance_style"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member: {
        Row: {
          created_at: string
          person_id: string
          role: Database["public"]["Enums"]["team_member_role"]
          studio_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          person_id: string
          role: Database["public"]["Enums"]["team_member_role"]
          studio_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          person_id?: string
          role?: Database["public"]["Enums"]["team_member_role"]
          studio_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_participant: {
        Row: {
          person_id: string
          thread_id: string
        }
        Insert: {
          person_id: string
          thread_id: string
        }
        Update: {
          person_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_participant_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_participant_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_participant_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_thread"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_read_state: {
        Row: {
          last_read_at: string
          person_id: string
          thread_id: string
        }
        Insert: {
          last_read_at?: string
          person_id: string
          thread_id: string
        }
        Update: {
          last_read_at?: string
          person_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_read_state_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_read_state_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_read_state_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_thread"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      booking_request_age: {
        Row: {
          age: string | null
          comp_team_id: string | null
          created_at: string | null
          decline_reason: string | null
          ends_at: string | null
          id: string | null
          is_escalated: boolean | null
          moves_event_id: string | null
          note: string | null
          preferred_space_id: string | null
          repeats: Database["public"]["Enums"]["repeat_rule"] | null
          requested_by: string | null
          resulting_event_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          studio_id: string | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          age?: never
          comp_team_id?: string | null
          created_at?: string | null
          decline_reason?: string | null
          ends_at?: string | null
          id?: string | null
          is_escalated?: never
          moves_event_id?: string | null
          note?: string | null
          preferred_space_id?: string | null
          repeats?: Database["public"]["Enums"]["repeat_rule"] | null
          requested_by?: string | null
          resulting_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          studio_id?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          age?: never
          comp_team_id?: string | null
          created_at?: string | null
          decline_reason?: string | null
          ends_at?: string | null
          id?: string | null
          is_escalated?: never
          moves_event_id?: string | null
          note?: string | null
          preferred_space_id?: string | null
          repeats?: Database["public"]["Enums"]["repeat_rule"] | null
          requested_by?: string | null
          resulting_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          studio_id?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_request_comp_team_id_fkey"
            columns: ["comp_team_id"]
            isOneToOne: false
            referencedRelation: "comp_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_moves_event_id_fkey"
            columns: ["moves_event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_preferred_space_id_fkey"
            columns: ["preferred_space_id"]
            isOneToOne: false
            referencedRelation: "studio_space"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_resulting_event_id_fkey"
            columns: ["resulting_event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      person_invite_status: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          invited_by: string | null
          person_id: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["invite_status"] | null
          studio_id: string | null
          token_hash: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          person_id?: string | null
          revoked_at?: string | null
          status?: never
          studio_id?: string | null
          token_hash?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          person_id?: string | null
          revoked_at?: string | null
          status?: never
          studio_id?: string | null
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_invite_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_invite_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_invite_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_invite_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_with_login"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_invite_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
      person_with_login: {
        Row: {
          auth_user_id: string | null
          bio: string | null
          created_at: string | null
          date_of_birth: string | null
          declined_at: string | null
          declined_reason: string | null
          email: string | null
          full_name: string | null
          has_own_login: boolean | null
          height_cm: number | null
          id: string | null
          is_active: boolean | null
          media_consent: boolean | null
          phone: string | null
          photo_path: string | null
          status: Database["public"]["Enums"]["person_status"] | null
          studio_id: string | null
          title: Database["public"]["Enums"]["instructor_title"] | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          email?: string | null
          full_name?: string | null
          has_own_login?: never
          height_cm?: number | null
          id?: string | null
          is_active?: boolean | null
          media_consent?: boolean | null
          phone?: string | null
          photo_path?: string | null
          status?: Database["public"]["Enums"]["person_status"] | null
          studio_id?: string | null
          title?: Database["public"]["Enums"]["instructor_title"] | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          email?: string | null
          full_name?: string | null
          has_own_login?: never
          height_cm?: number | null
          id?: string | null
          is_active?: boolean | null
          media_consent?: boolean | null
          phone?: string | null
          photo_path?: string | null
          status?: Database["public"]["Enums"]["person_status"] | null
          studio_id?: string | null
          title?: Database["public"]["Enums"]["instructor_title"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      booking_status: "pending" | "approved" | "declined" | "withdrawn"
      comp_team_role: "dancer" | "choreographer"
      comp_team_type:
        | "solo"
        | "duo"
        | "trio"
        | "small_group"
        | "large_group"
        | "production"
      content_scope: "studio" | "team" | "comp_team"
      essentials_item_type: "document" | "link" | "audio" | "note"
      event_type: "class" | "rehearsal" | "booking" | "call_time"
      instructor_title: "lead" | "assistant" | "choreographer" | "guest"
      invite_status: "pending" | "accepted" | "revoked" | "expired"
      join_code_scope: "parent_dancer" | "instructor"
      media_kind: "photo" | "video" | "audio" | "doc"
      media_processing_status: "ready" | "processing" | "failed"
      person_role: "director" | "instructor" | "dancer" | "parent"
      person_status: "pending" | "confirmed" | "declined"
      repeat_rule: "once" | "weekly" | "biweekly"
      team_member_role: "dancer" | "instructor"
      thread_scope: "studio" | "team" | "comp_team" | "direct"
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
  app: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: ["pending", "approved", "declined", "withdrawn"],
      comp_team_role: ["dancer", "choreographer"],
      comp_team_type: [
        "solo",
        "duo",
        "trio",
        "small_group",
        "large_group",
        "production",
      ],
      content_scope: ["studio", "team", "comp_team"],
      essentials_item_type: ["document", "link", "audio", "note"],
      event_type: ["class", "rehearsal", "booking", "call_time"],
      instructor_title: ["lead", "assistant", "choreographer", "guest"],
      invite_status: ["pending", "accepted", "revoked", "expired"],
      join_code_scope: ["parent_dancer", "instructor"],
      media_kind: ["photo", "video", "audio", "doc"],
      media_processing_status: ["ready", "processing", "failed"],
      person_role: ["director", "instructor", "dancer", "parent"],
      person_status: ["pending", "confirmed", "declined"],
      repeat_rule: ["once", "weekly", "biweekly"],
      team_member_role: ["dancer", "instructor"],
      thread_scope: ["studio", "team", "comp_team", "direct"],
    },
  },
} as const
