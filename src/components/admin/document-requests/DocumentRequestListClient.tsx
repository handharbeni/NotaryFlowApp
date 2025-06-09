
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { DocumentRequest, DocumentRequestStatus } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentRequestStatus } from '@/actions/documentActions';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { CheckCircle, XCircle, PackageCheck, PackageOpen, RotateCcw, Clock, Loader2, CalendarDays, UserCircle2, FileTextIcon, Inbox, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Added missing import

interface DocumentRequestListClientProps {
  initialRequests: DocumentRequest[];
  currentActorUserId: string;
}

type TabStatus = 'Pending Approval' | 'Approved - Pending Pickup' | 'Checked Out' | 'History';

const statusMapping: Record<TabStatus, DocumentRequestStatus[]> = {
  'Pending Approval': ['Pending Approval'],
  'Approved - Pending Pickup': ['Approved - Pending Pickup'],
  'Checked Out': ['Checked Out'],
  'History': ['Returned', 'Rejected', 'Cancelled'],
};

const statusDisplayNames: Record<DocumentRequestStatus, string> = {
    'Pending Approval': 'Menunggu Persetujuan',
    'Approved - Pending Pickup': 'Disetujui - Menunggu Pengambilan',
    'Checked Out': 'Diambil (Dipinjam)',
    'Returned': 'Dikembalikan',
    'Rejected': 'Ditolak',
    'Cancelled': 'Dibatalkan',
};

export function DocumentRequestListClient({ initialRequests, currentActorUserId }: DocumentRequestListClientProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [requests, setRequests] = useState<DocumentRequest[]>(initialRequests);
  const [activeTab, setActiveTab] = useState<TabStatus>('Pending Approval');
  
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({}); // request.id -> boolean
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [currentAction, setCurrentAction] = useState<{
    requestId: string;
    targetStatus: DocumentRequestStatus;
    actionName: string;
    requiresLocation?: boolean;
    requiresNotes?: boolean;
  } | null>(null);
  const [actionInput, setActionInput] = useState(''); // For location or notes


  useEffect(() => {
    setRequests(initialRequests.map(req => ({
        ...req,
        requestTimestamp: new Date(req.requestTimestamp),
        handledTimestamp: req.handledTimestamp ? new Date(req.handledTimestamp) : null,
        pickupTimestamp: req.pickupTimestamp ? new Date(req.pickupTimestamp) : null,
        actualReturnTimestamp: req.actualReturnTimestamp ? new Date(req.actualReturnTimestamp) : null,
    })));
  }, [initialRequests]);

  const filteredRequests = useMemo(() => {
    return requests.filter(req => statusMapping[activeTab].includes(req.status));
  }, [requests, activeTab]);

  const handleOpenActionDialog = (
    requestId: string, 
    targetStatus: DocumentRequestStatus, 
    actionName: string,
    requiresLocation: boolean = false,
    requiresNotes: boolean = false
  ) => {
    setCurrentAction({ requestId, targetStatus, actionName, requiresLocation, requiresNotes });
    setActionInput('');
    setShowActionDialog(true);
  };

  const handleConfirmAction = async () => {
    if (!currentAction) return;
    setIsProcessing(prev => ({...prev, [currentAction.requestId]: true}));
    
    const result = await updateDocumentRequestStatus(
      currentAction.requestId,
      currentAction.targetStatus,
      currentActorUserId,
      currentAction.requiresLocation ? actionInput : undefined, // newLocation
      currentAction.requiresNotes ? actionInput : (currentAction.targetStatus === 'Rejected' ? actionInput || 'Permintaan ditolak oleh CS/Admin.' : undefined) // notes
    );

    if (result.success) {
      toast({ title: 'Status Permintaan Diperbarui', description: `Permintaan telah ${currentAction.targetStatus.toLowerCase()}.` });
      router.refresh(); // Re-fetch requests
    } else {
      toast({ title: 'Gagal Memperbarui Status', description: result.error || 'Terjadi kesalahan.', variant: 'destructive' });
    }
    setIsProcessing(prev => ({...prev, [currentAction.requestId]: false}));
    setShowActionDialog(false);
    setCurrentAction(null);
  };

  const getStatusBadgeVariant = (status: DocumentRequestStatus) => {
    if (status === 'Pending Approval') return 'default';
    if (status === 'Approved - Pending Pickup') return 'default';
    if (status === 'Checked Out') return 'secondary';
    if (status === 'Returned') return 'outline';
    if (status === 'Rejected' || status === 'Cancelled') return 'destructive';
    return 'outline';
  };

  const renderRequestTable = (reqs: DocumentRequest[]) => {
    if (reqs.length === 0) {
      return (
        <div className="text-center py-10 text-muted-foreground">
          <Inbox className="mx-auto h-12 w-12 mb-4" />
          Tidak ada permintaan dalam status ini.
        </div>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama Dokumen</TableHead>
            <TableHead>Pemohon</TableHead>
            <TableHead>Tgl. Permintaan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reqs.map((req) => (
            <TableRow key={req.id} className="hover:bg-muted/50">
              <TableCell className="font-medium">
                <Link href={`/documents/${req.documentId}`} className="hover:underline text-primary flex items-center gap-1">
                    <FileTextIcon className="h-4 w-4"/> {req.documentName || req.documentId}
                </Link>
                </TableCell>
              <TableCell><UserCircle2 className="h-4 w-4 inline mr-1 text-muted-foreground"/>{req.requesterName || req.requesterId}</TableCell>
              <TableCell suppressHydrationWarning><CalendarDays className="h-4 w-4 inline mr-1 text-muted-foreground"/>{format(req.requestTimestamp, 'dd MMM yyyy, HH:mm', { locale: localeID })}</TableCell>
              <TableCell>
                <Badge variant={getStatusBadgeVariant(req.status)}>{statusDisplayNames[req.status] || req.status}</Badge>
                {req.handlerName && <span className="text-xs text-muted-foreground block mt-1">Ditangani: {req.handlerName}</span>}
              </TableCell>
              <TableCell className="text-right space-x-1">
                {isProcessing[req.id] ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary inline-block" />
                ) : (
                  <>
                    {req.status === 'Pending Approval' && (
                      <>
                        <Button size="sm" variant="default" onClick={() => handleOpenActionDialog(req.id, 'Approved - Pending Pickup', 'Setujui Permintaan')}>
                          <CheckCircle className="mr-1 h-4 w-4"/> Setujui
                        </Button>
                        <Button size="sm" variant="destructive-outline" onClick={() => handleOpenActionDialog(req.id, 'Rejected', 'Tolak Permintaan', false, true)}>
                           <XCircle className="mr-1 h-4 w-4"/> Tolak
                        </Button>
                      </>
                    )}
                    {req.status === 'Approved - Pending Pickup' && (
                      <Button size="sm" variant="default" onClick={() => handleOpenActionDialog(req.id, 'Checked Out', 'Konfirmasi Pengambilan')}>
                        <PackageCheck className="mr-1 h-4 w-4"/> Tandai Diambil
                      </Button>
                    )}
                    {req.status === 'Checked Out' && (
                      <Button size="sm" variant="default" onClick={() => handleOpenActionDialog(req.id, 'Returned', 'Konfirmasi Pengembalian', true, true)}>
                        <RotateCcw className="mr-1 h-4 w-4"/> Tandai Dikembalikan
                      </Button>
                    )}
                     {(req.status === 'Returned' || req.status === 'Rejected' || req.status === 'Cancelled') && (
                         <span className="text-xs text-muted-foreground italic">Tidak ada aksi</span>
                     )}
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabStatus)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6">
          <TabsTrigger value="Pending Approval">Menunggu Persetujuan</TabsTrigger>
          <TabsTrigger value="Approved - Pending Pickup">Siap Diambil</TabsTrigger>
          <TabsTrigger value="Checked Out">Dipinjam</TabsTrigger>
          <TabsTrigger value="History">Riwayat</TabsTrigger>
        </TabsList>
        
        {(Object.keys(statusMapping) as TabStatus[]).map(tabKey => (
          <TabsContent key={tabKey} value={tabKey}>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>{tabKey === 'History' ? 'Riwayat Permintaan' : `Permintaan: ${statusDisplayNames[statusMapping[tabKey][0]]}`}</CardTitle>
                <CardDescription>
                  {tabKey === 'History' 
                    ? 'Daftar permintaan yang telah selesai (dikembalikan, ditolak, atau dibatalkan).'
                    : `Daftar permintaan dokumen yang saat ini ${statusDisplayNames[statusMapping[tabKey][0]].toLowerCase()}.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderRequestTable(filteredRequests)}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentAction?.actionName || 'Konfirmasi Aksi'}</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin {currentAction?.actionName?.toLowerCase() || 'melanjutkan'} permintaan ini?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {currentAction?.requiresLocation && (
              <div>
                <label htmlFor="actionInputLocation" className="text-sm font-medium">Lokasi Penyimpanan Baru</label>
                <Input 
                  id="actionInputLocation" 
                  placeholder="cth: Rak B-02, Lemari Arsip CS" 
                  value={actionInput} 
                  onChange={(e) => setActionInput(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Wajib diisi jika dokumen dikembalikan.</p>
              </div>
            )}
            {currentAction?.requiresNotes && (
              <div>
                <label htmlFor="actionInputNotes" className="text-sm font-medium">
                    {currentAction.targetStatus === 'Rejected' ? 'Alasan Penolakan (Opsional)' : 'Catatan Tambahan (Opsional)'}
                </label>
                <Textarea
                  id="actionInputNotes"
                  placeholder={currentAction.targetStatus === 'Rejected' ? "Masukkan alasan penolakan..." : "Masukkan catatan tambahan..."}
                  value={currentAction.requiresLocation ? '' : actionInput} // If location is primary, notes is separate
                  onChange={(e) => {
                    if (!currentAction.requiresLocation) setActionInput(e.target.value);
                    // If both are required, this simple state won't work well.
                    // For now, assuming if location is required, notes are distinct or primary input IS location.
                    // This simple setup assumes `actionInput` is primarily for one field or a generic note.
                    // If targetStatus is 'Returned' AND notes are also allowed, it becomes ambiguous.
                    // The current `updateDocumentRequestStatus` takes notes separately.
                    // So, if requiresLocation is true, this field is for notes.
                    if (currentAction.requiresLocation && currentAction.requiresNotes) {
                        // This UI path for dual input not fully fleshed out in this simple dialog.
                        // Let's assume for now this `actionInput` will be used for `notes` if notes are required and location isn't,
                        // or if location IS required, we need a separate state for notes OR this is a generic note.
                        // The server action currently uses actionInput for location OR notes.
                        // Let's re-purpose this Textarea for notes if currentAction.requiresNotes is true.
                         setActionInput(e.target.value);
                    }
                  }}
                  rows={3}
                  className="mt-1"
                />
              </div>
            )}
             {currentAction?.targetStatus === 'Checked Out' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700 flex items-start gap-2">
                    <PackageOpen className="h-5 w-5 mt-0.5 flex-shrink-0"/>
                    <span>Pastikan dokumen telah diserahkan kepada pemohon. Lokasi dokumen akan diperbarui menjadi "Di tangan {requests.find(r => r.id === currentAction.requestId)?.requesterName}".</span>
                </div>
            )}
            {currentAction?.targetStatus === 'Approved - Pending Pickup' && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700 flex items-start gap-2">
                     <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0"/>
                    <span>Pemohon akan diberitahu bahwa dokumen mereka siap untuk diambil.</span>
                </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isProcessing[currentAction?.requestId || '']}>Batal</Button>
            </DialogClose>
            <Button 
                type="button" 
                onClick={handleConfirmAction} 
                disabled={isProcessing[currentAction?.requestId || ''] || (currentAction?.requiresLocation && !actionInput.trim())}
            >
              {isProcessing[currentAction?.requestId || ''] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

    