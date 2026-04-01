-- Surveys feature
CREATE TABLE IF NOT EXISTS surveys (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  fields JSON DEFAULT '[]',
  thank_you_title VARCHAR(255) DEFAULT 'Thank you!',
  thank_you_message TEXT DEFAULT 'Your response has been recorded.',
  redirect_url VARCHAR(500),
  color VARCHAR(7) DEFAULT '#2563eb',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  allow_multiple BOOLEAN NOT NULL DEFAULT true,
  require_email BOOLEAN NOT NULL DEFAULT false,
  notify_on_response BOOLEAN NOT NULL DEFAULT true,
  closes_at TIMESTAMP,
  max_responses INTEGER,
  linked_type VARCHAR(30),
  linked_id INTEGER,
  response_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  answers JSON NOT NULL,
  respondent_email VARCHAR(255),
  respondent_name VARCHAR(255),
  source VARCHAR(30) NOT NULL DEFAULT 'link',
  source_id VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_surveys_client_id ON surveys(client_id);
CREATE INDEX idx_surveys_slug ON surveys(slug);
CREATE INDEX idx_surveys_status ON surveys(status);
CREATE INDEX idx_surveys_linked ON surveys(linked_type, linked_id);
CREATE INDEX idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX idx_survey_responses_email ON survey_responses(respondent_email);
