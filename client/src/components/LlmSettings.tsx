import React, { useState, useEffect, ChangeEvent } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Loader2, Download, HardDrive, Cpu, MemoryStick, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface Model {
  name: string;
  filename: string;
  path: string;
  size: string;
}

interface SystemSpecs {
  totalMemory: string;
  availableMemory: string;
  cpuCores: number;
  platform: string;
}



interface LlmStatus {
  running: boolean;
  port?: number | null;
  model?: string;
  error?: string;
}

interface LlmSettingsProps {
  onClose: () => void;
}

function LlmSettings({ onClose }: LlmSettingsProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [systemSpecs, setSystemSpecs] = useState<SystemSpecs | null>(null);
  const [gpuName, setGpuName] = useState<string>('None');
  const [device, setDevice] = useState<string>('cpu');
  const [deviceName, setDeviceName] = useState<string>('None');
  const [backend, setBackend] = useState<string>('cpu');
  const [llmStatus, setLlmStatus] = useState<LlmStatus>({ running: false });
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);

  useEffect(() => {
    loadInitialData();
    checkLlmStatus();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsScanning(true);
      
      // Load settings and system specs
      const settings = await window.electron.getSettings();
      setSystemSpecs(settings.systemSpecs);
      // Set device info from backend
      setGpuName(settings.gpu_name || settings.device_name || 'None');
      setDevice(settings.device || 'cpu');
      setDeviceName(settings.device_name || 'None');
      setBackend(settings.backend || 'cpu');
      
      // Scan for available models
      const scannedModels = await window.electron.scanModels();
      setModels(scannedModels);
      
      // Prefer OpenChat as default if present and no model is selected
      if (scannedModels.length > 0 && !selectedModel) {
        // Filter out TinyLlama models
        const filteredModels = scannedModels.filter(m => !m.name.toLowerCase().includes('tinyllama'));
        setModels(filteredModels);
        const openChat = filteredModels.find(m => m.name.toLowerCase().includes('openchat'));
        if (openChat) {
          setSelectedModel(openChat.path);
        } else {
          setSelectedModel(filteredModels[0]?.path || '');
        }
      }
      
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const checkLlmStatus = async () => {
    try {
      const status = await window.electron.getLlmStatus();
      setLlmStatus(status);
    } catch (error) {
      console.error('Error checking LLM status:', error);
    }
  };

  const handleStartLlm = async () => {
    if (!selectedModel) return;
    
    setIsLoading(true);
    try {
      const result = await window.electron.startLlm(selectedModel, 8080);
      if (result.success) {
        await checkLlmStatus();
      } else {
        console.error('Failed to start LLM:', result.error);
      }
    } catch (error) {
      console.error('Error starting LLM:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopLlm = async () => {
    setIsLoading(true);
    try {
      const result = await window.electron.stopLlm();
      if (result.success) {
        await checkLlmStatus();
      }
    } catch (error) {
      console.error('Error stopping LLM:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshModels = async () => {
    setIsScanning(true);
    try {
      const scannedModels = await window.electron.scanModels();
      setModels(scannedModels);
    } catch (error) {
      console.error('Error refreshing models:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const getModelRecommendation = (model: Model) => {
    if (!systemSpecs) return '';
    
    const memoryGB = parseFloat(systemSpecs.totalMemory);
    const modelSizeGB = parseFloat(model.size);
    
    if (modelSizeGB * 1.5 > memoryGB) {
      return 'May be too large for your system';
    } else if (modelSizeGB * 2 < memoryGB) {
      return 'Recommended for your system';
    } else {
      return 'Should work on your system';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">LLM Settings</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Configure your local language model
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>

      {/* System Information */}
      {systemSpecs && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              System Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MemoryStick className="h-4 w-4" />
                Total Memory:
              </span>
              <Badge variant="secondary">{systemSpecs.totalMemory}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                CPU Cores:
              </span>
              <Badge variant="secondary">{systemSpecs.cpuCores}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Platform:
              </span>
              <Badge variant="secondary">{systemSpecs.platform}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Device/GPU:
              </span>
              <Badge variant="secondary">{gpuName}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Device Type:
              </span>
              <Badge variant="secondary">{device}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Device Name:
              </span>
              <Badge variant="secondary">{deviceName}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Backend:
              </span>
              <Badge variant="secondary">{backend}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* LLM Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {llmStatus.running ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
            LLM Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span>Status:</span>
              <Badge variant={llmStatus.running ? "default" : "destructive"}>
                {llmStatus.running ? "Running" : "Stopped"}
              </Badge>
            </div>
            {llmStatus.running && llmStatus.port && (
              <div className="flex items-center justify-between">
                <span>Port:</span>
                <Badge variant="secondary">{llmStatus.port}</Badge>
              </div>
            )}
            {llmStatus.model && (
              <div className="flex items-center justify-between">
                <span>Model:</span>
                <Badge variant="secondary">{llmStatus.model}</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Model Selection</span>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshModels}
              disabled={isScanning}
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Choose a model to run locally. Models are automatically detected from the resources/models folder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {models.length > 0 ? (
            <>
              <Select value={selectedModel} onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedModel(e.target.value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.path} value={model.path}>
                      <div className="flex items-center justify-between w-full">
                        <span>{model.name}</span>
                        <Badge variant="outline" className="ml-2">
                          {model.size}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedModel && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium">Selected Model:</span>
                      <span>{models.find(m => m.path === selectedModel)?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Size:</span>
                      <span>{models.find(m => m.path === selectedModel)?.size}</span>
                    </div>
                    {systemSpecs && (
                      <div className="flex justify-between">
                        <span className="font-medium">Compatibility:</span>
                        <span className="text-xs">
                          {getModelRecommendation(models.find(m => m.path === selectedModel)!)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Models Found</h3>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                No GGUF models were found in the resources/models directory.
              </p>
              <Dialog open={showModelSelector} onOpenChange={setShowModelSelector}>
                <DialogTrigger asChild>
                  <Button>
                    <Download className="h-4 w-4 mr-2" />
                    Download Models
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Download Models</DialogTitle>
                    <DialogDescription>
                      Model download functionality will be available in the next update.
                      For now, please manually place GGUF model files in the resources/models directory.
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Control Buttons */}
      {models.length > 0 && selectedModel && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3">
              {!llmStatus.running ? (
                <Button
                  onClick={handleStartLlm}
                  disabled={isLoading || !selectedModel}
                  className="flex-1"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Start LLM
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleStopLlm}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mr-2" />
                  )}
                  Stop LLM
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default LlmSettings;

