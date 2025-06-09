
'use client';

import type { Document, DocumentRequest, DocumentRequestStatus, User, DocumentLocationLog } from '@/types'; 
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Edit3, Trash2, ArrowLeft, CalendarDays, Info, GitBranch, Tag, Download, Loader2, Image as ImageIcon, FileWarning, Send, PackageCheck, PackageX, RotateCcw, CheckCircle2, Users as UsersIcon, MapPin, History, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { downloadDocumentData, requestOriginalDocument, updateDocumentRequestStatus } from '@/actions/documentActions'; 
import { triggerBrowserDownload } from '@/lib/downloadUtils';
import { useSession } from 'next-auth/react'; 
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


interface DocumentDetailClientProps {
  initialDocument: Document & { originalFileHolderName?: string, currentRequesterName?: string };
  initialUserActiveRequest?: DocumentRequest;
  allUsers: Pick<User, 'id' | 'name' | 'username' | 'role'>[];
  initialLocationLogs: DocumentLocationLog[];
}

export function DocumentDetailClient({ initialDocument, initialUserActiveRequest, allUsers, initialLocationLogs }: DocumentDetailClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const [document, setDocument] = useState<Document & { originalFileHolderName?: string, currentRequesterName?: string } | null>(initialDocument);
  const [userActiveRequest, setUserActiveRequest] = useState<DocumentRequest | undefined>(initialUserActiveRequest);
  const [locationLogs, setLocationLogs] = useState<DocumentLocationLog[]>(initialLocationLogs);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false); 
  const [isRequesting, setIsRequesting] = useState(false); 
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUpdatingRequest, setIsUpdatingRequest] = useState(false);

  const [showReturnDialog, setShowReturnDialog] = useState(false);

  const [showRequestOnBehalfDialog, setShowRequestOnBehalfDialog] = useState(false);
  const [selectedUserForBehalfRequest, setSelectedUserForBehalfRequest] = useState<string | undefined>(undefined);


  useEffect(() => {
    if (initialDocument) {
        setDocument({
            ...initialDocument,
            dateUploaded: new Date(initialDocument.dateUploaded),
            lastModified: new Date(initialDocument.lastModified),
            requestedAt: initialDocument.requestedAt ? new Date(initialDocument.requestedAt) : null,
        });
    }
    setUserActiveRequest(initialUserActiveRequest);
    setLocationLogs(initialLocationLogs.map(log => ({...log, timestamp: new Date(log.timestamp)})));
  }, [initialDocument, initialUserActiveRequest, initialLocationLogs]);


  const [formattedDateUploaded, setFormattedDateUploaded] = useState<string | null>(null);
  const [formattedLastModified, setFormattedLastModified] = useState<string | null>(null);
  const [formattedRequestedAt, setFormattedRequestedAt] = useState<string | null>(null);


  useEffect(() => {
    if (document?.dateUploaded) {
      setFormattedDateUploaded(format(new Date(document.dateUploaded), 'PPP p', { locale: localeID }));
    }
    if (document?.lastModified) {
      setFormattedLastModified(format(new Date(document.lastModified), 'PPP p', { locale: localeID }));
    }
    if (document?.requestedAt) {
      setFormattedRequestedAt(format(new Date(document.requestedAt), 'PPP p', { locale: localeID }));
    }
  }, [document]);


  const handleDeleteDocument = async () => {
    if (!document) return;
    setIsLoading(true);
    // Placeholder: actual delete should be a server action
    toast({
      title: 'Dokumen "Dihapus" (Placeholder)',
      description: `Dokumen "${document.name}" akan dihapus. Implementasi server diperlukan.`,
    });
    // router.push('/documents');
    setShowDeleteConfirm(false);
    setIsLoading(false);
  };

  const handleDownload = async () => {
     if (!document || !document.ownCloudPath) {
        toast({ title: "Gagal Mengunduh", description: "Jalur dokumen tidak tersedia.", variant: "destructive"});
        return;
    }
    setIsDownloading(true);
    try {
        const result = await downloadDocumentData(document.id);
        if (result.success && result.data && result.fileName && result.mimeType) {
            triggerBrowserDownload(result.fileName, result.mimeType, result.data);
            toast({ title: "Unduhan Dimulai", description: `Mengunduh ${result.fileName}.`});
        } else {
            toast({ title: "Gagal Mengunduh", description: result.error || "Tidak dapat mengunduh file.", variant: "destructive"});
        }
    } catch (error: any) {
        toast({ title: "Kesalahan Unduh", description: error.message || "Terjadi kesalahan tak terduga.", variant: "destructive"});
    }
    setIsDownloading(false);
  };

  const handleRequestOriginal = async (targetUserId?: string) => {
    if (!document || !session?.user?.id) return;
    const effectiveRequesterId = targetUserId || session.user.id;

    setIsRequesting(true);
    const result = await requestOriginalDocument(document.id, effectiveRequesterId);
    if (result.success) {
      toast({ title: "Permintaan Terkirim", description: "Permintaan Anda untuk dokumen asli telah dikirim." });
      router.refresh(); 
      setShowRequestOnBehalfDialog(false); 
      setSelectedUserForBehalfRequest(undefined);
    } else {
      toast({ title: "Gagal Mengirim Permintaan", description: result.error || "Terjadi kesalahan.", variant: "destructive" });
    }
    setIsRequesting(false);
  };

  const handleUpdateRequest = async (newStatus: DocumentRequestStatus, notes?: string, location?: string) => {
    if (!userActiveRequest || !session?.user?.id) return;
    setIsUpdatingRequest(true);
    const result = await updateDocumentRequestStatus(userActiveRequest.id, newStatus, session.user.id, location, notes);
    if (result.success) {
        toast({title: "Status Permintaan Diperbarui", description: `Permintaan dokumen telah ${newStatus.toLowerCase()}.`});
        router.refresh();
    } else {
        toast({title: "Gagal Memperbarui Status", description: result.error || "Terjadi kesalahan.", variant: "destructive"});
    }
    setIsUpdatingRequest(false);
    setShowReturnDialog(false);
  };

  const isCSOrAdmin = session?.user?.role === 'cs' || session?.user?.role === 'admin';
  
  const canSelfRequest = document && !document.isOriginalRequested && session?.user?.id !== document.originalFileHolderId;
  const canRequestOnBehalf = isCSOrAdmin && document && !document.isOriginalRequested;


  const statusColors: { [key: string]: string } = {
      Draft: 'bg-gray-500 hover:bg-gray-600',
      'Pending Review': 'bg-yellow-500 hover:bg-yellow-600',
      Notarized: 'bg-green-500 hover:bg-green-600',
      Archived: 'bg-slate-500 hover:bg-slate-600',
  };

  if (!document) {
     return (
      <div className="container mx-auto px-4 md:px-6 py-6 flex justify-center items-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading document details...</p>
      </div>
    );
  }

  const isImagePreview = document.type?.startsWith('image/') && document.contentPreview?.startsWith('data:image');
  const isTextPreview = document.type === 'text/plain' && document.contentPreview && !document.contentPreview.startsWith('data:');

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
         <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Daftar
        </Button>
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary flex-shrink-0" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground break-all mt-0">{document.name}</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" asChild>
              <Link href={`/documents/${document.id}/edit`}>
                <Edit3 className="mr-2 h-4 w-4" /> Ubah
              </Link>
            </Button>
            <Button variant="destructive-outline" onClick={() => setShowDeleteConfirm(true)} disabled={isLoading}>
              <Trash2 className="mr-2 h-4 w-4" /> Hapus
            </Button>
            <Button onClick={handleDownload} disabled={!document.ownCloudPath || isDownloading}>
              {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Unduh
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Detail Dokumen Digital</CardTitle>
              <CardDescription>Informasi tentang file digital dan metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Tipe</p>
                  <p className="text-foreground">{document.type}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Status Digital</p>
                  <Badge variant="outline" className={`${statusColors[document.status] || 'bg-gray-400'} text-white border-none text-xs`}>
                    {document.status}
                  </Badge>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Tanggal Diunggah</p>
                  <p className="text-foreground flex items-center gap-1" suppressHydrationWarning>
                    <CalendarDays className="h-4 w-4" /> {formattedDateUploaded || <Loader2 className="h-3 w-3 animate-spin" />}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Terakhir Diubah</p>
                  <p className="text-foreground flex items-center gap-1" suppressHydrationWarning>
                    <CalendarDays className="h-4 w-4" /> {formattedLastModified || <Loader2 className="h-3 w-3 animate-spin" />}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Ukuran File</p>
                  <p className="text-foreground flex items-center gap-1"><Info className="h-4 w-4" /> {document.fileSize}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Versi Digital</p>
                  <p className="text-foreground flex items-center gap-1"><GitBranch className="h-4 w-4" /> {document.version}</p>
                </div>
                {document.ownCloudPath && (
                    <div>
                        <p className="font-medium text-muted-foreground">Jalur Penyimpanan Digital</p>
                        <p className="text-foreground break-all text-xs">{document.ownCloudPath}</p>
                    </div>
                )}
              </div>
              {document.tags && document.tags.length > 0 && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Tag</p>
                  <div className="flex flex-wrap gap-2">
                    {document.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs"><Tag className="mr-1 h-3 w-3"/>{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-6 pt-4 border-t">
                <p className="font-semibold text-lg text-foreground mb-3">Pratinjau Konten</p>
                <Card className="bg-muted/30 p-4 border-dashed min-h-[200px] flex flex-col justify-center items-center">
                  {isImagePreview && document.contentPreview ? (
                    <img
                      src={document.contentPreview}
                      alt={`Pratinjau ${document.name}`}
                      className="max-w-full h-auto rounded-md shadow-sm"
                      data-ai-hint="document image"
                    />
                  ) : isTextPreview && document.contentPreview ? (
                    <pre className="text-sm text-foreground whitespace-pre-wrap font-mono bg-background p-3 rounded-md overflow-x-auto w-full">
                      {document.contentPreview}
                    </pre>
                  ) : document.type === 'application/pdf' ? (
                    <div className="text-center text-muted-foreground p-6">
                      <FileText className="h-20 w-20 mx-auto text-red-500/70 mb-3" />
                      <p className="font-semibold text-foreground">Dokumen PDF</p>
                      <p className="text-xs mt-1 mb-4">Pratinjau untuk file PDF tidak ditampilkan langsung di halaman ini.</p>
                      <Button variant="outline" size="sm" onClick={handleDownload} disabled={!document.ownCloudPath || isDownloading}>
                        {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Unduh PDF untuk Dilihat
                      </Button>
                    </div>
                  ) : document.contentPreview ? ( 
                    <div className="flex items-center text-sm text-muted-foreground">
                      <FileWarning className="h-5 w-5 mr-2 text-yellow-500" />
                      <span>Data pratinjau mentah atau pratinjau tidak sepenuhnya dirender: {document.contentPreview.substring(0, 150)}...</span>
                    </div>
                  ) : ( 
                    <div className="text-center text-muted-foreground p-6">
                      <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="font-semibold">Tidak Ada Pratinjau</p>
                      <p className="text-xs mt-1">Tidak ada pratinjau yang tersedia untuk tipe dokumen ini atau konten tidak dapat diambil.</p>
                    </div>
                  )}
                </Card>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
                <p className="text-xs text-muted-foreground">ID Dokumen: {document.id}</p>
            </CardFooter>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Informasi Dokumen Asli (Fisik)</CardTitle>
              <CardDescription>Status dan lokasi dokumen fisik asli.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">Pemegang Dokumen Asli Saat Ini</p>
                <p className="text-foreground flex items-center gap-1"><UserCircle className="h-4 w-4" /> {document.originalFileHolderName || document.originalFileHolderId || 'Tidak diketahui'}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Lokasi Fisik Dokumen Asli</p>
                <p className="text-foreground flex items-center gap-1"><MapPin className="h-4 w-4" /> {document.originalFileLocation || 'Tidak diketahui'}</p>
              </div>

              {document.isOriginalRequested && (document.currentRequesterName || userActiveRequest) && (
                <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-md">
                  <p className="font-semibold text-yellow-800">Status Permintaan Dokumen Asli:</p>
                  <p className="text-yellow-700" suppressHydrationWarning>
                    Saat ini {userActiveRequest?.status ? `${userActiveRequest.status} oleh` : `diminta oleh/dicek keluar oleh`} {document.currentRequesterName || userActiveRequest?.requesterName}.
                    {document.requestedAt && ` (${formattedRequestedAt || <Loader2 className="h-3 w-3 animate-spin inline-block"/>})`}
                  </p>
                </div>
              )}

              {canSelfRequest && session?.user?.id && (
                <Button onClick={() => handleRequestOriginal(session.user.id)} disabled={isRequesting} className="w-full mt-2">
                  {isRequesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Minta Dokumen Asli (Untuk Diri Sendiri)
                </Button>
              )}
              
              {canRequestOnBehalf && (
                <Button variant="outline" onClick={() => setShowRequestOnBehalfDialog(true)} disabled={isRequesting} className="w-full mt-2">
                  <UsersIcon className="mr-2 h-4 w-4" /> Minta Dokumen Asli untuk Pengguna Lain
                </Button>
              )}
              
              {userActiveRequest && userActiveRequest.requesterId === session?.user?.id && (
                <>
                    {userActiveRequest.status === 'Approved - Pending Pickup' && (
                        <Button onClick={() => handleUpdateRequest('Checked Out', 'Dokumen diambil oleh pemohon.')} disabled={isUpdatingRequest} className="w-full mt-2 bg-green-600 hover:bg-green-700">
                            {isUpdatingRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
                            Konfirmasi Pengambilan Dokumen Asli
                        </Button>
                    )}
                    {userActiveRequest.status === 'Checked Out' && (
                        <Button onClick={() => setShowReturnDialog(true)} disabled={isUpdatingRequest} className="w-full mt-2 bg-blue-600 hover:bg-blue-700">
                            {isUpdatingRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            Ajukan Pengembalian Dokumen Asli
                        </Button>
                    )}
                    {userActiveRequest.status === 'Pending Approval' && (
                        <Button 
                            onClick={() => handleUpdateRequest('Cancelled', 'Dibatalkan oleh pemohon.')} 
                            disabled={isUpdatingRequest} 
                            variant="outline"
                            className="w-full mt-2 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                            {isUpdatingRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageX className="mr-2 h-4 w-4" />}
                            Batalkan Permintaan
                        </Button>
                    )}
                </>
              )}
            </CardContent>
          </Card>
          
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Riwayat Lokasi Dokumen Asli</CardTitle>
              <CardDescription>Log perpindahan dan status dokumen fisik.</CardDescription>
            </CardHeader>
            <CardContent>
              {locationLogs.length > 0 ? (
                <ScrollArea className="h-[250px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lokasi</TableHead>
                        <TableHead>Pengguna</TableHead>
                        <TableHead>Alasan</TableHead>
                        <TableHead>Waktu</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locationLogs.map(log => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">{log.location}</TableCell>
                          <TableCell>{log.userName || log.actorUserName || 'Sistem'}</TableCell>
                          <TableCell className="text-xs">{log.changeReason || '-'}</TableCell>
                          <TableCell className="text-xs" suppressHydrationWarning>{formatDistanceToNow(log.timestamp, { addSuffix: true, locale: localeID })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Belum ada riwayat lokasi untuk dokumen ini.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>


      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apakah Anda yakin ingin menghapus dokumen ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen: "{document.name}"<br />
              Tindakan ini tidak dapat dibatalkan dan akan menghapus dokumen secara permanen (implementasi server diperlukan).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)} disabled={isLoading}>Batal</AlertDialogCancel>
            <AlertDialogAction
                onClick={handleDeleteDocument}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Hapus Dokumen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Ajukan Pengembalian Dokumen</DialogTitle>
                <DialogDescription>
                    Dokumen "{document?.name}" akan ditandai sebagai "Returned".
                    CS akan memverifikasi dan memperbarui lokasi penyimpanan akhir.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
                 <p className="text-sm text-muted-foreground">Ini akan mengirim notifikasi ke CS bahwa Anda telah mengembalikan dokumen.</p>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isUpdatingRequest}>Batal</Button>
                </DialogClose>
                <Button 
                    type="button" 
                    onClick={() => handleUpdateRequest('Returned', 'Dokumen dikembalikan oleh pemohon.')} 
                    disabled={isUpdatingRequest}
                >
                    {isUpdatingRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Konfirmasi Pengembalian
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for Requesting on Behalf of Another User */}
      <Dialog open={showRequestOnBehalfDialog} onOpenChange={(isOpen) => {
        setShowRequestOnBehalfDialog(isOpen);
        if (!isOpen) setSelectedUserForBehalfRequest(undefined);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Minta Dokumen Asli Atas Nama Pengguna Lain</DialogTitle>
            <DialogDescription>
              Pilih pengguna yang akan menjadi pemohon dokumen asli "{document?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label htmlFor="behalf-user-select">Pilih Pengguna</Label>
            <Select 
              value={selectedUserForBehalfRequest} 
              onValueChange={setSelectedUserForBehalfRequest}
            >
              <SelectTrigger id="behalf-user-select">
                <SelectValue placeholder="Pilih pengguna..." />
              </SelectTrigger>
              <SelectContent>
                {allUsers.filter(u => u.id !== session?.user?.id) 
                  .map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name || user.username} ({user.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {allUsers.filter(u => u.id !== session?.user?.id).length === 0 && (
                <p className="text-sm text-muted-foreground">Tidak ada pengguna lain yang tersedia untuk dipilih.</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isRequesting}>Batal</Button>
            </DialogClose>
            <Button 
              type="button" 
              onClick={() => selectedUserForBehalfRequest && handleRequestOriginal(selectedUserForBehalfRequest)} 
              disabled={isRequesting || !selectedUserForBehalfRequest}
            >
              {isRequesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Kirim Permintaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

