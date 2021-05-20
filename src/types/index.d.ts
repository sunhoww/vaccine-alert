type Vaccine = 'COVISHIELD' | 'COVAXIN';

type Slot =
  | '09:00AM-11:00AM'
  | '11:00AM-01:00PM'
  | '01:00PM-03:00PM'
  | '03:00PM-06:00PM';

interface Session {
  session_id: string;
  date: string;
  available_capacity: number;
  min_age_limit: number;
  vaccine: Vaccine;
  slots: Slot[];
  available_capacity_dose1: number;
  available_capacity_dose2: number;
}

interface Center {
  center_id: number;
  name: string;
  address: string;
  state_name: string;
  district_name: string;
  block_name: string;
  pincode: number;
  lat: number;
  long: number;
  from: string;
  to: string;
  fee_type: 'Free';
  sessions: Session[];
}
