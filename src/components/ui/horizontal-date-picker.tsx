
'use client';

import * as React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {
  format,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

interface HorizontalDatePickerProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
}

export function HorizontalDatePicker({
  selectedDate,
  onDateSelect,
}: HorizontalDatePickerProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
  });
  const [currentMonth, setCurrentMonth] = React.useState(startOfMonth(selectedDate));

  const daysInMonth = React.useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    });
  }, [currentMonth]);

  const handleDateClick = (date: Date) => {
    onDateSelect(date);
  };

  React.useEffect(() => {
    if (emblaApi) {
        const selectedDayIndex = daysInMonth.findIndex((day) =>
            isSameDay(day, selectedDate)
        );
        if (selectedDayIndex !== -1) {
            // Instantly snap to the selected date if it's far, otherwise slide
            const isFar = Math.abs(emblaApi.selectedScrollSnap() - selectedDayIndex) > 5;
            emblaApi.scrollTo(selectedDayIndex, !isFar);
        }

        if (!isSameDay(startOfMonth(selectedDate), currentMonth)) {
            setCurrentMonth(startOfMonth(selectedDate));
        }
    }
  }, [selectedDate, emblaApi, daysInMonth, currentMonth]);


  const handleMonthChange = (date: Date | undefined) => {
    if (date) {
        onDateSelect(date);
        setCurrentMonth(startOfMonth(date));
    }
  };
  
  const goToPreviousMonth = () => {
    const prevMonth = subMonths(currentMonth, 1);
    onDateSelect(startOfMonth(prevMonth));
  };
  
  const goToNextMonth = () => {
    const nextMonth = addMonths(currentMonth, 1);
    onDateSelect(startOfMonth(nextMonth));
  };


  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between px-2">
        <Button variant="ghost" size="icon" onClick={goToPreviousMonth} className='h-8 w-8'>
            <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={"ghost"}
                    className={cn(
                        "w-auto justify-start text-center font-semibold text-lg"
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(currentMonth, 'MMMM yyyy')}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
                <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleMonthChange}
                    initialFocus
                    defaultMonth={currentMonth}
                />
            </PopoverContent>
        </Popover>

         <Button variant="ghost" size="icon" onClick={goToNextMonth} className='h-8 w-8'>
            <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-card to-transparent pointer-events-none" />
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex items-start gap-3 pb-2 -ml-2 pl-4">
            {daysInMonth.map((day, index) => {
              const isActive = isSameDay(day, selectedDate);
              return (
                <div key={index} className="flex-shrink-0 basis-[4.5rem]">
                    <button
                      onClick={() => handleDateClick(day)}
                      className={cn(
                        'flex flex-col items-center justify-center p-2 rounded-lg w-16 h-20 transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground font-bold shadow-lg'
                          : 'bg-card text-card-foreground hover:bg-accent'
                      )}
                    >
                      <span className={cn("text-xs uppercase", isActive ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{format(day, 'Eee')}</span>
                      <span className="text-2xl font-bold">{format(day, 'd')}</span>
                    </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-card to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
