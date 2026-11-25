import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useRef } from 'react';
import { Button } from './Button';

export function ConfirmAction({open,onCancel,onConfirm,title,description,confirmLabel,busy=false,error,testId}:{
  open:boolean; onCancel:()=>void; onConfirm:()=>void; title:string; description:string; confirmLabel:string; busy?:boolean; error?:string; testId?:string;
}){
  const previousFocus=useRef<HTMLElement|null>(null);
  return <AlertDialog.Root open={open} onOpenChange={value=>{if(!value&&!busy)onCancel();}}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm"/>
      <AlertDialog.Content data-testid={testId} className="!fixed inset-x-4 top-4 bottom-4 z-[71] m-auto h-fit max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain glass glass-2 p-4 sm:p-6 outline-none"
        onOpenAutoFocus={()=>{previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;}}
        onCloseAutoFocus={event=>{if(previousFocus.current?.isConnected){event.preventDefault();previousFocus.current.focus();}}}
        onEscapeKeyDown={event=>{if(busy)event.preventDefault();}}>
        <AlertDialog.Title className="t-title text-ink-hi break-words">{title}</AlertDialog.Title>
        <AlertDialog.Description className="t-body text-ink-mid mt-3 break-words">{description}</AlertDialog.Description>
        {error&&<p role="alert" className="t-body text-st-noshow mt-3 break-words">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <AlertDialog.Cancel asChild><Button variant="secondary" disabled={busy}>Voltar</Button></AlertDialog.Cancel>
          <Button variant="danger" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
