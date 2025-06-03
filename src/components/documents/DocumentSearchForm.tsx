
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, Search, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ANY_PLACEHOLDER = "_ANY_";

const searchFormSchema = z.object({
  keyword: z.string().optional(),
  documentType: z.string().optional(),
  status: z.string().optional(), // Keep as string, will match enum values
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
}).refine(data => !data.dateFrom || !data.dateTo || data.dateTo >= data.dateFrom, {
  message: "Date To cannot be earlier than Date From.",
  path: ["dateTo"],
});

export type SearchFormValues = z.infer<typeof searchFormSchema>;

interface DocumentSearchFormProps {
  onSearchSubmit: (values: Partial<SearchFormValues>) => void; // Allow partial for undefineds
}

export function DocumentSearchForm({ onSearchSubmit }: DocumentSearchFormProps) {
  const { toast } = useToast();
  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      keyword: '',
      documentType: ANY_PLACEHOLDER,
      status: ANY_PLACEHOLDER,
      dateFrom: undefined,
      dateTo: undefined,
    },
  });

  function onSubmit(values: SearchFormValues) {
    const { documentType, status, ...rest } = values;
    const cleanedValues: Partial<SearchFormValues> = {
      ...rest,
      documentType: documentType === ANY_PLACEHOLDER ? undefined : documentType,
      status: status === ANY_PLACEHOLDER ? undefined : status,
    };
    onSearchSubmit(cleanedValues);
  }

  function handleReset() {
    const defaultFormValues = { keyword: '', documentType: ANY_PLACEHOLDER, status: ANY_PLACEHOLDER, dateFrom: undefined, dateTo: undefined };
    form.reset(defaultFormValues);
    onSearchSubmit({ keyword: '', documentType: undefined, status: undefined, dateFrom: undefined, dateTo: undefined });
    toast({
      title: 'Filters Reset',
      description: 'Search filters have been cleared.',
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="keyword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Keyword</FormLabel>
              <FormControl>
                <Input placeholder="Search by name, tag, or content..." {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="documentType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Any Type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={ANY_PLACEHOLDER}>Any Type</SelectItem>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="DOCX">DOCX</SelectItem>
                  <SelectItem value="Agreement">Agreement</SelectItem>
                  <SelectItem value="Deed">Deed</SelectItem>
                  <SelectItem value="Affidavit">Affidavit</SelectItem>
                  <SelectItem value="Will">Will</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Any Status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={ANY_PLACEHOLDER}>Any Status</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Pending Review">Pending Review</SelectItem>
                  <SelectItem value="Notarized">Notarized</SelectItem>
                  <SelectItem value="Archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dateFrom"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Date From</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value ? (
                        format(field.value, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) =>
                      (form.getValues("dateTo") && date > form.getValues("dateTo")!) || date > new Date()
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dateTo"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Date To</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value ? (
                        format(field.value, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) =>
                      date < (form.getValues("dateFrom") || new Date(0)) || date > new Date()
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex space-x-2 pt-2">
          <Button type="submit" className="flex-1">
            <Search className="mr-2 h-4 w-4" /> Search
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} className="flex-1">
            <RotateCcw className="mr-2 h-4 w-4" /> Reset
          </Button>
        </div>
      </form>
    </Form>
  );
}
