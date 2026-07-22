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
    align: 'center',
    containScroll: false,
  });
  const [currentMonth, setCurrentMonth] = React.useState(startOfMonth(selectedDate));
  const [tweenValues, setTweenValues] = React.useState<number[]>([]);

  const daysInMonth = React.useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    });
  }, [currentMonth]);

  const onSelect = React.useCallback(() => {
    if (!emblaApi) return;
    const selectedIndex = emblaApi.selectedScrollSnap();
    const snapDate = daysInMonth[selectedIndex];
    
    // Only update if the selected date is different
    if (snapDate && !isSameDay(snapDate, selectedDate)) {
      onDateSelect(snapDate);
    }
  }, [emblaApi, daysInMonth, onDateSelect, selectedDate]);

  const onScroll = React.useCallback(() => {
    if (!emblaApi) return;

    const scrollProgress = emblaApi.scrollProgress();
    const snaps = emblaApi.scrollSnapList();

    const values = snaps.map((snap) => {
      const diff = snap - scrollProgress;
      const progress = 1 - Math.pow(Math.abs(diff), 2) * 3;
      return Math.max(0, progress);
    });

    setTweenValues((prev) => {
      // Avoid re-renders if the values are virtually identical
      const isSame = prev.length === values.length && 
        prev.every((v, i) => Math.abs(v - values[i]) < 0.001);
      return isSame ? prev : values;
    });
  }, [emblaApi]);

  // Use refs for callbacks to keep the event listener registration stable
  // and prevent re-subscription loops when callbacks change due to props.
  const onSelectRef = React.useRef(onSelect);
  const onScrollRef = React.useRef(onScroll);

  React.useEffect(() => {
    onSelectRef.current = onSelect;
    onScrollRef.current = onScroll;
  });

  React.useEffect(() => {
    if (!emblaApi) return;

    const scrollHandler = () => onScrollRef.current();
    const selectHandler = () => onSelectRef.current();

    // Initial calculation for visual state
    onScrollRef.current();

    emblaApi.on('scroll', scrollHandler);
    emblaApi.on('select', selectHandler);
    emblaApi.on('reInit', scrollHandler);

    return () => {
      emblaApi.off('scroll', scrollHandler);
      emblaApi.off('select', selectHandler);
      emblaApi.off('reInit', scrollHandler);
    };
  }, [emblaApi]);

  React.useEffect(() => {
    if (emblaApi) {
      const selectedDayIndex = daysInMonth.findIndex((day) =>
        isSameDay(day, selectedDate)
      );
      
      if (selectedDayIndex !== -1 && selectedDayIndex !== emblaApi.selectedScrollSnap()) {
        emblaApi.scrollTo(selectedDayIndex);
      }
      
      if (!isSameDay(startOfMonth(selectedDate), currentMonth)) {
        setCurrentMonth(startOfMonth(selectedDate));
      }
    }
  }, [selectedDate, emblaApi, daysInMonth, currentMonth]);

  const handleDateClick = (index: number) => {
    if (emblaApi) {
      emblaApi.scrollTo(index);
    }
  };
  
  const handleMonthChange = (date: Date | undefined) => {
    if (date) {
        onDateSelect(date);
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
          <div className="flex items-center gap-3 pb-2 -ml-2 pl-4 h-24">
            {daysInMonth.map((day, index) => {
              const isActive = isSameDay(day, selectedDate);
              const scale = tweenValues[index] !== undefined ? tweenValues[index] * 0.25 + 0.75 : 0.75;
              const opacity = tweenValues[index] !== undefined ? tweenValues[index] * 0.7 + 0.3 : 0.3;

              return (
                <div 
                    key={index}
                    className="flex-shrink-0 basis-24 transition-transform duration-100 ease-out" 
                    style={{ transform: `scale(${scale})` }}
                >
                    <button
                      onClick={() => handleDateClick(index)}
                      className={cn(
                        'flex flex-col items-center justify-center p-2 rounded-lg w-16 h-20 transition-all duration-300',
                        isActive
                          ? 'bg-primary text-primary-foreground font-bold shadow-lg'
                          : 'bg-card text-card-foreground hover:bg-accent'
                      )}
                      style={{ opacity }}
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
