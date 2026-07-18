'use client';

import ContentCalendar from '@/components/content-calendar/ContentCalendar';

export default function AdminContentCalendarPage() {
  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Content Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of all content across all websites.
          </p>
        </div>
        <ContentCalendar basePath="/admin" />
      </div>
    </main>
  );
}
